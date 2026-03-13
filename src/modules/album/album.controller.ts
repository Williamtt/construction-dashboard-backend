import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { albumService } from './album.service.js'
import { z } from 'zod'

const createAlbumSchema = z.object({
  name: z.string().min(1, '相簿名稱為必填'),
})

const addPhotoSchema = z.object({
  attachmentId: z.string().min(1, 'attachmentId 必填'),
})

export const albumController = {
  async list(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const albums = await albumService.listAlbums(projectId, req.user.id, req.user)
    res.status(200).json({
      data: albums.map((a) => ({
        id: a.id,
        projectId: a.projectId,
        name: a.name,
        createdAt: a.createdAt.toISOString(),
      })),
    })
  },

  async create(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const parsed = createAlbumSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ')
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const album = await albumService.createAlbum(projectId, parsed.data.name, req.user.id, req.user)
    res.status(201).json({
      data: {
        id: album.id,
        projectId: album.projectId,
        name: album.name,
        createdAt: album.createdAt.toISOString(),
      },
    })
  },

  async delete(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const albumId = req.params.albumId as string
    await albumService.deleteAlbum(albumId, req.user.id, req.user)
    res.status(204).send()
  },

  async listPhotos(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const albumId = req.params.albumId as string
    const items = await albumService.listAlbumPhotos(albumId, req.user.id, req.user)
    res.status(200).json({
      data: items.map((row) => ({
        id: row.id,
        projectId: row.projectId,
        fileName: row.fileName,
        fileSize: row.fileSize,
        mimeType: row.mimeType,
        category: row.category,
        uploadedById: row.uploadedById,
        uploaderName: row.uploaderName ?? null,
        createdAt: row.createdAt.toISOString(),
        url: `/api/v1/files/${row.id}`,
      })),
    })
  },

  async addPhoto(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const albumId = req.params.albumId as string
    const parsed = addPhotoSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ')
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    await albumService.addPhotoToAlbum(
      albumId,
      parsed.data.attachmentId,
      req.user.id,
      req.user
    )
    res.status(204).send()
  },

  async removePhoto(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const albumId = req.params.albumId as string
    const attachmentId = req.params.attachmentId as string
    await albumService.removePhotoFromAlbum(albumId, attachmentId, req.user.id, req.user)
    res.status(204).send()
  },
}
