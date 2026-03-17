import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { resourceController } from '../modules/resource/index.js'

export const resourcesRouter = Router({ mergeParams: true })

/** GET /api/v1/projects/:projectId/resources?type=labor|equipment|material — 列表 */
resourcesRouter.get('/', asyncHandler(resourceController.list.bind(resourceController)))

/** POST /api/v1/projects/:projectId/resources — 新增 */
resourcesRouter.post('/', asyncHandler(resourceController.create.bind(resourceController)))

/** PATCH /api/v1/projects/:projectId/resources/:id — 更新 */
resourcesRouter.patch('/:id', asyncHandler(resourceController.update.bind(resourceController)))

/** DELETE /api/v1/projects/:projectId/resources/:id — 刪除 */
resourcesRouter.delete('/:id', asyncHandler(resourceController.delete.bind(resourceController)))
