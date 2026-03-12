import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { fileController } from '../modules/file/index.js'
import { uploadSingleFile } from '../middleware/upload.js'

export const filesRouter = Router()

/** POST /api/v1/files/upload — 傳統上傳，multipart: file, projectId, category?, businessId? */
filesRouter.post('/upload', uploadSingleFile, asyncHandler(fileController.upload.bind(fileController)))

/** GET /api/v1/files/:id — 取得檔案（可 ?download=true 下載） */
filesRouter.get('/:id', asyncHandler(fileController.getById.bind(fileController)))

/** DELETE /api/v1/files/:id */
filesRouter.delete('/:id', asyncHandler(fileController.delete.bind(fileController)))
