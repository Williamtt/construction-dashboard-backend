import { AppError } from '../../shared/errors.js'
import { notDeleted } from '../../shared/soft-delete.js'
import { prisma } from '../../lib/db.js'
import { albumRepository, type AlbumRecord } from './album.repository.js'
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
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId, ...notDeleted },
    select: { status: true },
  })
  if (!member || member.status !== 'active') {
    throw new AppError(403, 'FORBIDDEN', '非專案成員或已停用，無法存取此專案')
  }
}

export type AlbumPhotoItem = AttachmentRecord & {
  uploaderName: string | null
}

export const albumService = {
  async listAlbums(projectId: string, userId: string, user: AuthUser): Promise<AlbumRecord[]> {
    await ensureUserCanAccessProject(projectId, userId, user.systemRole === 'platform_admin')
    return albumRepository.findByProjectId(projectId)
  },

  async createAlbum(
    projectId: string,
    name: string,
    userId: string,
    user: AuthUser
  ): Promise<AlbumRecord> {
    await ensureUserCanAccessProject(projectId, userId, user.systemRole === 'platform_admin')
    const trimmed = name.trim()
    if (!trimmed) {
      throw new AppError(400, 'VALIDATION_ERROR', '相簿名稱為必填')
    }
    return albumRepository.create(projectId, trimmed)
  },

  async deleteAlbum(
    albumId: string,
    userId: string,
    user: AuthUser
  ): Promise<void> {
    const album = await albumRepository.findById(albumId)
    if (!album) {
      throw new AppError(404, 'NOT_FOUND', '找不到該相簿')
    }
    await ensureUserCanAccessProject(album.projectId, userId, user.systemRole === 'platform_admin')
    await albumRepository.delete(albumId, userId)
  },

  async listAlbumPhotos(
    albumId: string,
    userId: string,
    user: AuthUser
  ): Promise<AlbumPhotoItem[]> {
    const album = await albumRepository.findById(albumId)
    if (!album) {
      throw new AppError(404, 'NOT_FOUND', '找不到該相簿')
    }
    await ensureUserCanAccessProject(album.projectId, userId, user.systemRole === 'platform_admin')
    const attachmentIds = await albumRepository.getAttachmentIds(albumId)
    if (attachmentIds.length === 0) {
      return []
    }
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

  async addPhotoToAlbum(
    albumId: string,
    attachmentId: string,
    userId: string,
    user: AuthUser
  ): Promise<void> {
    const album = await albumRepository.findById(albumId)
    if (!album) {
      throw new AppError(404, 'NOT_FOUND', '找不到該相簿')
    }
    await ensureUserCanAccessProject(album.projectId, userId, user.systemRole === 'platform_admin')
    const attachment = await fileRepository.findById(attachmentId)
    if (!attachment) {
      throw new AppError(404, 'NOT_FOUND', '找不到該檔案')
    }
    if (attachment.projectId !== album.projectId) {
      throw new AppError(400, 'BAD_REQUEST', '檔案必須屬於同一專案')
    }
    await albumRepository.addPhoto(albumId, attachmentId)
  },

  async removePhotoFromAlbum(
    albumId: string,
    attachmentId: string,
    userId: string,
    user: AuthUser
  ): Promise<void> {
    const album = await albumRepository.findById(albumId)
    if (!album) {
      throw new AppError(404, 'NOT_FOUND', '找不到該相簿')
    }
    await ensureUserCanAccessProject(album.projectId, userId, user.systemRole === 'platform_admin')
    await albumRepository.removePhoto(albumId, attachmentId)
  },
}
