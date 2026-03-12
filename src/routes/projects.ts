import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { projectController } from '../modules/project/index.js'
import { scheduleAdjustmentsRouter } from './schedule-adjustments.js'

export const projectsRouter = Router()

/** GET /api/v1/projects — 專案列表（分頁；之後依登入者權限過濾） */
projectsRouter.get('/', asyncHandler(projectController.list.bind(projectController)))

/** POST /api/v1/projects — 新增專案（之後需驗證權限） */
projectsRouter.post('/', asyncHandler(projectController.create.bind(projectController)))

/** 工期調整（須在 /:id 之前掛載，否則會被 :id 吃掉） */
projectsRouter.use('/:projectId/schedule-adjustments', scheduleAdjustmentsRouter)

/** GET /api/v1/projects/:id — 單一專案（含專案資訊欄位） */
projectsRouter.get('/:id', asyncHandler(projectController.getById.bind(projectController)))

/** PATCH /api/v1/projects/:id — 更新專案（含專案資訊；限同租戶或 platform_admin） */
projectsRouter.patch('/:id', asyncHandler(projectController.update.bind(projectController)))
