import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { repairRequestService } from './repair-request.service.js'
import {
  createRepairRequestSchema,
  updateRepairRequestSchema,
  createRepairExecutionRecordSchema,
} from '../../schemas/repair-request.js'
import type { AttachmentMeta } from './repair-request.service.js'
import type { RepairListItem, RepairExecutionRecordRow } from './repair-request.repository.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

function getProjectId(req: Request): string {
  const id = req.params.projectId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少專案 ID')
}

function getRepairId(req: Request): string {
  const id = req.params.id
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少報修單 ID')
}

function getRecordId(req: Request): string {
  const id = req.params.recordId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少報修紀錄 ID')
}

function dateToIso(d: Date | null): string | null {
  return d ? d.toISOString() : null
}

function toRepairDto(
  row: RepairListItem,
  extras?: { photos?: AttachmentMeta[]; attachments?: AttachmentMeta[] }
) {
  return {
    id: row.id,
    projectId: row.projectId,
    customerName: row.customerName,
    contactPhone: row.contactPhone,
    repairContent: row.repairContent,
    unitLabel: row.unitLabel,
    remarks: row.remarks,
    problemCategory: row.problemCategory,
    isSecondRepair: row.isSecondRepair,
    deliveryDate: dateToIso(row.deliveryDate),
    repairDate: dateToIso(row.repairDate),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(extras?.photos && { photos: extras.photos }),
    ...(extras?.attachments && { attachments: extras.attachments }),
  }
}

function toRepairRecordDto(
  row: RepairExecutionRecordRow,
  photos?: AttachmentMeta[]
) {
  return {
    id: row.id,
    repairId: row.repairId,
    content: row.content,
    recordedById: row.recordedById,
    recordedBy: row.recordedBy
      ? { id: row.recordedBy.id, name: row.recordedBy.name, email: row.recordedBy.email }
      : null,
    createdAt: row.createdAt.toISOString(),
    ...(photos && { photos }),
  }
}

export const repairRequestController = {
  async list(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    const { items, total } = await repairRequestService.list(
      projectId,
      { status, page, limit },
      user
    )
    res.status(200).json({
      data: items.map((row) => toRepairDto(row)),
      meta: { page, limit, total },
    })
  },

  async getById(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const repairId = getRepairId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const result = await repairRequestService.getById(projectId, repairId, user)
    if (!result) {
      throw new AppError(404, 'NOT_FOUND', '找不到該報修單')
    }
    const { photos, attachments, ...row } = result
    res.status(200).json({
      data: toRepairDto(row, { photos, attachments }),
    })
  },

  async create(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const parsed = createRepairRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await repairRequestService.create(projectId, parsed.data, user)
    res.status(201).json({ data: toRepairDto(item) })
  },

  async update(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const repairId = getRepairId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const parsed = updateRepairRequestSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await repairRequestService.update(projectId, repairId, parsed.data, user)
    res.status(200).json({ data: toRepairDto(item) })
  },

  async delete(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const repairId = getRepairId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    await repairRequestService.delete(projectId, repairId, user)
    res.status(204).send()
  },

  async listRecords(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const repairId = getRepairId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const records = await repairRequestService.listRecords(repairId, projectId, user)
    res.status(200).json({
      data: records.map((r) => toRepairRecordDto(r, r.photos)),
    })
  },

  async createRecord(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const repairId = getRepairId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const parsed = createRepairExecutionRecordSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const record = await repairRequestService.createRecord(projectId, repairId, parsed.data, user)
    res.status(201).json({ data: toRepairRecordDto(record) })
  },

  async getRecord(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const repairId = getRepairId(req)
    const recordId = getRecordId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const result = await repairRequestService.getRecordById(projectId, repairId, recordId, user)
    if (!result) {
      throw new AppError(404, 'NOT_FOUND', '找不到該報修紀錄')
    }
    res.status(200).json({ data: toRepairRecordDto(result, result.photos) })
  },
}
