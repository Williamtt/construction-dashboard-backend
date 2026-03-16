import { AppError } from '../../shared/errors.js'
import { prisma } from '../../lib/db.js'
import { photoFavoriteRepository } from './photo-favorite.repository.js'
import { fileRepository, type AttachmentRecord } from '../file/file.repository.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

async function ensureUserCanAccessProject(
  projectId: string,
  userId: string,
  isPlatformAdmin: boolean
): Promise<void> {
  if (isPlatformAdmin) return
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { status: true },
  })
  if (!member || member.status !== 'active') {
    throw new AppError(403, 'FORBIDDEN', '非專案成員或已停用，無法存取此專案')
  }
}

export type FavoritePhotoItem = AttachmentRecord & {
  uploaderName: string | null
}

export const photoFavoriteService = {
  async list(projectId: string, userId: string, user: AuthUser): Promise<FavoritePhotoItem[]> {
    await ensureUserCanAccessProject(projectId, userId, user.systemRole === 'platform_admin')
    const attachmentIds = await photoFavoriteRepository.findAttachmentIdsByUserAndProject(
      userId,
      projectId
    )
    if (attachmentIds.length === 0) return []
    const { items } = await fileRepository.findManyByIds(attachmentIds)
    return items.map((row: AttachmentRecord & { uploadedBy?: { name: string | null } }) => ({
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
      uploaderName: row.uploadedBy?.name ?? null,
    }))
  },

  async add(
    projectId: string,
    attachmentId: string,
    userId: string,
    user: AuthUser
  ): Promise<void> {
    await ensureUserCanAccessProject(projectId, userId, user.systemRole === 'platform_admin')
    const attachment = await fileRepository.findById(attachmentId)
    if (!attachment) {
      throw new AppError(404, 'NOT_FOUND', '找不到該檔案')
    }
    if (attachment.projectId !== projectId) {
      throw new AppError(400, 'BAD_REQUEST', '檔案必須屬於此專案')
    }
    await photoFavoriteRepository.add(userId, attachmentId)
  },

  async remove(
    projectId: string,
    attachmentId: string,
    userId: string,
    user: AuthUser
  ): Promise<void> {
    await ensureUserCanAccessProject(projectId, userId, user.systemRole === 'platform_admin')
    await photoFavoriteRepository.remove(userId, attachmentId)
  },
}
