import crypto from 'node:crypto'
import { AppError } from '../../shared/errors.js'
import { projectRepository } from '../project/project.repository.js'
import { fileRepository, type AttachmentRecord } from './file.repository.js'
import { storage } from '../../lib/storage/index.js'
import {
  UPLOAD_MAX_FILE_SIZE_DEFAULT_BYTES,
} from '../../constants/file.js'
import { prisma } from '../../lib/db.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

async function ensureUserCanAccessProject(projectId: string, userId: string, isPlatformAdmin: boolean): Promise<void> {
  if (isPlatformAdmin) return
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  })
  if (!member) {
    throw new AppError(403, 'FORBIDDEN', '非專案成員，無法存取此專案檔案')
  }
}

function sha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function buildStorageKey(tenantId: string | null, projectId: string, fileName: string): string {
  const uid = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const prefix = tenantId ? `${tenantId}/${projectId}` : `_/${projectId}`
  return `${prefix}/${uid}_${safe}`
}

export const fileService = {
  async uploadFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    projectId: string,
    userId: string,
    user: AuthUser,
    options: { category?: string; businessId?: string } = {}
  ): Promise<AttachmentRecord> {
    await ensureUserCanAccessProject(projectId, userId, user.systemRole === 'platform_admin')

    const project = await projectRepository.findById(projectId)
    if (!project) {
      throw new AppError(404, 'NOT_FOUND', '找不到該專案')
    }

    const tenantId = project.tenantId
    const fileSize = buffer.length

    // 單檔上限
    const tenant = tenantId ? await prisma.tenant.findUnique({ where: { id: tenantId } }) : null
    const fileLimitBytes = tenant?.fileSizeLimitMb != null
      ? tenant.fileSizeLimitMb * 1024 * 1024
      : UPLOAD_MAX_FILE_SIZE_DEFAULT_BYTES
    if (fileSize > fileLimitBytes) {
      throw new AppError(
        403,
        'FILE_SIZE_EXCEEDED',
        `單一檔案不得超過 ${tenant?.fileSizeLimitMb ?? Math.round(UPLOAD_MAX_FILE_SIZE_DEFAULT_BYTES / 1024 / 1024)} MB`
      )
    }

    // 總量配額（僅有租戶時檢查）
    if (tenantId && tenant?.storageQuotaMb != null) {
      const usage = await fileRepository.getTenantStorageUsageBytesSimple(tenantId)
      const quotaBytes = tenant.storageQuotaMb * 1024 * 1024
      if (usage + fileSize > quotaBytes) {
        throw new AppError(
          403,
          'STORAGE_QUOTA_EXCEEDED',
          `儲存空間已達上限（已用 ${Math.round(usage / 1024 / 1024)} MB / 上限 ${tenant.storageQuotaMb} MB）`
        )
      }
    }

    const fileHash = sha256(buffer)
    const existing = await fileRepository.findByProjectAndHash(projectId, fileHash)
    let storageKey: string

    if (existing) {
      storageKey = existing.storageKey
      // 去重：不寫入新實體，只建一筆新記錄
    } else {
      storageKey = buildStorageKey(tenantId, projectId, fileName)
      await storage.upload(buffer, storageKey, mimeType)
    }

    const attachment = await fileRepository.create({
      projectId,
      tenantId,
      storageKey,
      fileName,
      fileSize,
      mimeType,
      fileHash,
      category: options.category ?? null,
      businessId: options.businessId ?? null,
      uploadedById: userId,
    })
    return attachment
  },

  async getById(
    id: string,
    userId: string,
    user: AuthUser
  ): Promise<AttachmentRecord & { stream?: import('node:stream').Readable; contentType?: string }> {
    const att = await fileRepository.findById(id)
    if (!att) {
      throw new AppError(404, 'NOT_FOUND', '找不到該檔案')
    }
    await ensureUserCanAccessProject(att.projectId, userId, user.systemRole === 'platform_admin')
    const { stream, contentType } = await storage.getStream(att.storageKey)
    return { ...att, stream, contentType: contentType ?? att.mimeType }
  },

  async getByIdMetadata(id: string, userId: string, user: AuthUser): Promise<AttachmentRecord> {
    const att = await fileRepository.findById(id)
    if (!att) {
      throw new AppError(404, 'NOT_FOUND', '找不到該檔案')
    }
    await ensureUserCanAccessProject(att.projectId, userId, user.systemRole === 'platform_admin')
    return att
  },

  async listByProject(
    projectId: string,
    args: { page: number; limit: number; category?: string },
    userId: string,
    user: AuthUser
  ): Promise<{ items: (AttachmentRecord & { uploaderName?: string | null })[]; total: number }> {
    await ensureUserCanAccessProject(projectId, userId, user.systemRole === 'platform_admin')
    const skip = (args.page - 1) * args.limit
    const { items, total } = await fileRepository.findByProjectId(projectId, {
      skip,
      take: args.limit,
      category: args.category,
    })
    const withUser = items.map((row: AttachmentRecord & { uploadedBy?: { name: string | null } }) => ({
      id: row.id,
      projectId: row.projectId,
      tenantId: row.tenantId,
      storageKey: row.storageKey,
      fileName: row.fileName,
      fileSize: row.fileSize,
      mimeType: row.mimeType,
      fileHash: row.fileHash,
      category: row.category,
      businessId: row.businessId,
      uploadedById: row.uploadedById,
      createdAt: row.createdAt,
      uploaderName: (row as { uploadedBy?: { name: string | null } }).uploadedBy?.name ?? null,
    }))
    return { items: withUser, total }
  },

  async delete(id: string, userId: string, user: AuthUser): Promise<void> {
    const att = await fileRepository.findById(id)
    if (!att) {
      throw new AppError(404, 'NOT_FOUND', '找不到該檔案')
    }
    await ensureUserCanAccessProject(att.projectId, userId, user.systemRole === 'platform_admin')

    const refCount = await fileRepository.countByStorageKey(att.storageKey)
    await fileRepository.delete(id)
    if (refCount <= 1) {
      await storage.delete(att.storageKey)
    }
  },

  async getTenantStorageUsage(tenantId: string): Promise<{ usageBytes: number }> {
    const usageBytes = await fileRepository.getTenantStorageUsageBytesSimple(tenantId)
    return { usageBytes }
  },
}
