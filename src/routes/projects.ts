import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { projectController } from '../modules/project/index.js'
import { fileController } from '../modules/file/index.js'
import { formTemplateController } from '../modules/form-template/index.js'
import { uploadSingleFile } from '../middleware/upload.js'
import { scheduleAdjustmentsRouter } from './schedule-adjustments.js'
import { albumsRouter } from './albums.js'
import { photoFavoriteController } from '../modules/photo-favorite/index.js'

export const projectsRouter = Router()

/** GET /api/v1/projects — 專案列表（分頁；之後依登入者權限過濾） */
projectsRouter.get('/', asyncHandler(projectController.list.bind(projectController)))

/** POST /api/v1/projects — 新增專案（之後需驗證權限） */
projectsRouter.post('/', asyncHandler(projectController.create.bind(projectController)))

/** 工期調整（須在 /:id 之前掛載，否則會被 :id 吃掉） */
projectsRouter.use('/:projectId/schedule-adjustments', scheduleAdjustmentsRouter)

/** GET /api/v1/projects/:projectId/files — 專案附件列表（須在 /:id 之前） */
projectsRouter.get('/:projectId/files', asyncHandler(fileController.listByProject.bind(fileController)))

/** GET /api/v1/projects/:projectId/form-templates — 專案可見表單樣板（預設+專案） */
projectsRouter.get('/:projectId/form-templates', asyncHandler(formTemplateController.listForProject.bind(formTemplateController)))

/** POST /api/v1/projects/:projectId/form-templates — 專案新增表單樣板（multipart: file, name, description） */
projectsRouter.post('/:projectId/form-templates', uploadSingleFile, asyncHandler(formTemplateController.createForProject.bind(formTemplateController)))

/** 相簿（照片管理） */
projectsRouter.use('/:projectId/albums', albumsRouter)

/** 我的最愛（個人，他人不可見） */
projectsRouter.get('/:projectId/photo-favorites', asyncHandler(photoFavoriteController.list.bind(photoFavoriteController)))
projectsRouter.post('/:projectId/photo-favorites', asyncHandler(photoFavoriteController.add.bind(photoFavoriteController)))
projectsRouter.delete('/:projectId/photo-favorites/:attachmentId', asyncHandler(photoFavoriteController.remove.bind(photoFavoriteController)))

/** GET /api/v1/projects/:id — 單一專案（含專案資訊欄位） */
projectsRouter.get('/:id', asyncHandler(projectController.getById.bind(projectController)))

/** PATCH /api/v1/projects/:id — 更新專案（含專案資訊；限同租戶或 platform_admin） */
projectsRouter.patch('/:id', asyncHandler(projectController.update.bind(projectController)))
