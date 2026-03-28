import { prisma } from '../../lib/db.js'
import { AppError } from '../../shared/errors.js'
import { notDeleted } from '../../shared/soft-delete.js'
import { assertCanAccessProject } from '../../shared/project-access.js'
import { assertProjectModuleAction } from '../project-permission/project-permission.service.js'
import { createNotificationForProjectMembers } from '../notifications/notifications.service.js'
import {
  defectImprovementRepository,
  defectExecutionRecordRepository,
  type DefectListItem,
  type DefectExecutionRecordRow,
} from './defect-improvement.repository.js'
import type { Prisma } from '@prisma/client'
import type {
  CreateDefectImprovementBody,
  UpdateDefectImprovementBody,
  CreateDefectExecutionRecordBody,
  UpdateDefectExecutionRecordBody,
} from '../../schemas/defect-improvement.js'

const DEFECT_PHOTO_CATEGORY = 'defect'
const DEFECT_RECORD_PHOTO_CATEGORY = 'defect_record'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

async function ensureDefect(
  projectId: string,
  user: AuthUser,
  action: 'read' | 'create' | 'update' | 'delete'
): Promise<void> {
  await assertCanAccessProject(user, projectId)
  await assertProjectModuleAction(user, projectId, 'construction.defect', action)
}

/** 將已上傳的附件綁定到業務 ID（缺陷或執行紀錄） */
async function linkAttachments(
  projectId: string,
  attachmentIds: string[],
  businessId: string,
  category: string
): Promise<void> {
  if (attachmentIds.length === 0) return
  await prisma.attachment.updateMany({
    where: { id: { in: attachmentIds }, projectId },
    data: { businessId, category },
  })
}

const MAX_LINKED_ATTACHMENTS = 30

async function replaceLinkedAttachments(
  projectId: string,
  businessId: string,
  category: string,
  newIds: string[]
): Promise<void> {
  const unique = [...new Set(newIds)]
  if (unique.length > MAX_LINKED_ATTACHMENTS) {
    throw new AppError(400, 'VALIDATION_ERROR', `附件最多 ${MAX_LINKED_ATTACHMENTS} 個`)
  }
  if (unique.length > 0) {
    const rows = await prisma.attachment.findMany({
      where: { id: { in: unique }, projectId, ...notDeleted },
      select: { id: true, category: true, businessId: true },
    })
    if (rows.length !== unique.length) {
      throw new AppError(400, 'VALIDATION_ERROR', '附件 id 無效或已刪除')
    }
    for (const r of rows) {
      const ok = r.category === category && (r.businessId == null || r.businessId === businessId)
      if (!ok) {
        throw new AppError(400, 'VALIDATION_ERROR', '附件無法用於此缺失／紀錄')
      }
    }
  }

  const unlinkWhere: Prisma.AttachmentWhereInput = {
    projectId,
    businessId,
    category,
    ...notDeleted,
  }
  if (unique.length > 0) {
    unlinkWhere.id = { notIn: unique }
  }
  await prisma.attachment.updateMany({
    where: unlinkWhere,
    data: { businessId: null },
  })

  if (unique.length > 0) {
    await prisma.attachment.updateMany({
      where: { id: { in: unique }, projectId, ...notDeleted },
      data: { businessId, category },
    })
  }
}

export type AttachmentMeta = {
  id: string
  fileName: string
  fileSize: number
  mimeType: string
  createdAt: string
  url: string
}

async function getAttachmentsByBusiness(
  projectId: string,
  businessId: string,
  category: string
): Promise<AttachmentMeta[]> {
  const list = await prisma.attachment.findMany({
    where: { projectId, businessId, category, ...notDeleted },
    orderBy: { createdAt: 'asc' },
    select: { id: true, fileName: true, fileSize: true, mimeType: true, createdAt: true },
  })
  return list.map((a) => ({
    id: a.id,
    fileName: a.fileName,
    fileSize: a.fileSize,
    mimeType: a.mimeType,
    createdAt: a.createdAt.toISOString(),
    url: `/api/v1/files/${a.id}`,
  }))
}

export const defectImprovementService = {
  async list(
    projectId: string,
    args: { status?: string; page?: number; limit?: number; search?: string },
    user: AuthUser
  ): Promise<{ items: DefectListItem[]; total: number }> {
    await ensureDefect(projectId, user, 'read')
    const limit = Math.min(50, Math.max(1, args.limit ?? 20))
    const page = Math.max(1, args.page ?? 1)
    const skip = (page - 1) * limit
    const search =
      typeof args.search === 'string' && args.search.trim() ? args.search.trim() : undefined
    const [items, total] = await Promise.all([
      defectImprovementRepository.findManyByProject(projectId, {
        status: args.status,
        search,
        skip,
        take: limit,
      }),
      defectImprovementRepository.countByProject(projectId, args.status, search),
    ])
    return { items, total }
  },

  async getById(
    projectId: string,
    defectId: string,
    user: AuthUser
  ): Promise<(DefectListItem & { photos: AttachmentMeta[] }) | null> {
    await ensureDefect(projectId, user, 'read')
    const defect = await defectImprovementRepository.findById(defectId)
    if (!defect || defect.projectId !== projectId) return null
    const photos = await getAttachmentsByBusiness(projectId, defectId, DEFECT_PHOTO_CATEGORY)
    return { ...defect, photos }
  },

  async listRecords(
    defectId: string,
    projectId: string,
    user: AuthUser
  ): Promise<(DefectExecutionRecordRow & { photos: AttachmentMeta[] })[]> {
    await ensureDefect(projectId, user, 'read')
    const defect = await defectImprovementRepository.findById(defectId)
    if (!defect || defect.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該缺失改善')
    }
    const records = await defectExecutionRecordRepository.findManyByDefectId(defectId)
    if (records.length === 0) return []
    const recordIds = records.map((r) => r.id)
    const allPhotos = await prisma.attachment.findMany({
      where: {
        projectId,
        category: DEFECT_RECORD_PHOTO_CATEGORY,
        businessId: { in: recordIds },
        ...notDeleted,
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fileName: true, fileSize: true, mimeType: true, createdAt: true, businessId: true },
    })
    const photosByRecordId = new Map<string, AttachmentMeta[]>()
    for (const a of allPhotos) {
      const bid = a.businessId as string
      if (!photosByRecordId.has(bid)) photosByRecordId.set(bid, [])
      photosByRecordId.get(bid)!.push({
        id: a.id,
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
        url: `/api/v1/files/${a.id}`,
      })
    }
    return records.map((r) => ({
      ...r,
      photos: photosByRecordId.get(r.id) ?? [],
    }))
  },

  async getRecordById(
    projectId: string,
    defectId: string,
    recordId: string,
    user: AuthUser
  ): Promise<(DefectExecutionRecordRow & { photos: AttachmentMeta[] }) | null> {
    await ensureDefect(projectId, user, 'read')
    const defect = await defectImprovementRepository.findById(defectId)
    if (!defect || defect.projectId !== projectId) return null
    const record = await defectExecutionRecordRepository.findById(recordId)
    if (!record || record.defectId !== defectId) return null
    const photos = await getAttachmentsByBusiness(projectId, recordId, DEFECT_RECORD_PHOTO_CATEGORY)
    return { ...record, photos }
  },

  async create(projectId: string, body: CreateDefectImprovementBody, user: AuthUser): Promise<DefectListItem> {
    await ensureDefect(projectId, user, 'create')
    const defect = await defectImprovementRepository.create({
      projectId,
      description: body.description.trim(),
      discoveredBy: body.discoveredBy.trim(),
      priority: body.priority,
      floor: body.floor?.trim() || null,
      location: body.location?.trim() || null,
      status: body.status,
    })
    if (body.attachmentIds?.length) {
      await linkAttachments(projectId, body.attachmentIds, defect.id, DEFECT_PHOTO_CATEGORY)
    }
    createNotificationForProjectMembers(
      projectId,
      'defect',
      '新缺失改善',
      `${body.discoveredBy} 記錄了新缺失：${body.description.slice(0, 50)}`,
      `/projects/${projectId}/defect`
    ).catch(() => {})
    return defect
  },

  async update(
    projectId: string,
    defectId: string,
    body: UpdateDefectImprovementBody,
    user: AuthUser
  ): Promise<DefectListItem> {
    await ensureDefect(projectId, user, 'update')
    const existing = await defectImprovementRepository.findById(defectId)
    if (!existing || existing.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該缺失改善')
    }
    const row = await defectImprovementRepository.update(defectId, {
      ...(body.description !== undefined && { description: body.description.trim() }),
      ...(body.discoveredBy !== undefined && { discoveredBy: body.discoveredBy.trim() }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.floor !== undefined && { floor: body.floor?.trim() || null }),
      ...(body.location !== undefined && { location: body.location?.trim() || null }),
      ...(body.status !== undefined && { status: body.status }),
    })
    if (body.attachmentIds !== undefined) {
      await replaceLinkedAttachments(projectId, defectId, DEFECT_PHOTO_CATEGORY, body.attachmentIds)
    }
    return row
  },

  async delete(projectId: string, defectId: string, user: AuthUser): Promise<void> {
    await ensureDefect(projectId, user, 'delete')
    const existing = await defectImprovementRepository.findById(defectId)
    if (!existing || existing.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該缺失改善')
    }
    await defectImprovementRepository.delete(defectId, user.id)
  },

  async createRecord(
    projectId: string,
    defectId: string,
    body: CreateDefectExecutionRecordBody,
    user: AuthUser
  ): Promise<DefectExecutionRecordRow> {
    await ensureDefect(projectId, user, 'create')
    const defect = await defectImprovementRepository.findById(defectId)
    if (!defect || defect.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該缺失改善')
    }
    const record = await defectExecutionRecordRepository.create({
      defectId,
      content: body.content.trim(),
      recordedById: user.id,
    })
    if (body.attachmentIds?.length) {
      await linkAttachments(projectId, body.attachmentIds, record.id, DEFECT_RECORD_PHOTO_CATEGORY)
    }
    return record
  },

  async updateRecord(
    projectId: string,
    defectId: string,
    recordId: string,
    body: UpdateDefectExecutionRecordBody,
    user: AuthUser
  ): Promise<DefectExecutionRecordRow> {
    await ensureDefect(projectId, user, 'update')
    const defect = await defectImprovementRepository.findById(defectId)
    if (!defect || defect.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該缺失改善')
    }
    const existing = await defectExecutionRecordRepository.findById(recordId)
    if (!existing || existing.defectId !== defectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該執行紀錄')
    }
    const updated = await defectExecutionRecordRepository.updateContent(recordId, body.content.trim())
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', '找不到該執行紀錄')
    }
    if (body.attachmentIds !== undefined) {
      await replaceLinkedAttachments(projectId, recordId, DEFECT_RECORD_PHOTO_CATEGORY, body.attachmentIds)
    }
    return updated
  },
}
