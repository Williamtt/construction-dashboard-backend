import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { photoFavoriteService } from './photo-favorite.service.js'
import { z } from 'zod'

const addFavoriteSchema = z.object({
  attachmentId: z.string().min(1, 'attachmentId 必填'),
})

export const photoFavoriteController = {
  async list(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const items = await photoFavoriteService.list(projectId, req.user.id, req.user)
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

  async add(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const parsed = addFavoriteSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ')
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    await photoFavoriteService.add(projectId, parsed.data.attachmentId, req.user.id, req.user)
    res.status(204).send()
  },

  async remove(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const attachmentId = req.params.attachmentId as string
    await photoFavoriteService.remove(projectId, attachmentId, req.user.id, req.user)
    res.status(204).send()
  },
}
