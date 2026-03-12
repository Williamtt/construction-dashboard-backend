import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { scheduleAdjustmentController } from '../modules/schedule-adjustment/index.js'

export const scheduleAdjustmentsRouter = Router({ mergeParams: true })

/** GET /api/v1/projects/:projectId/schedule-adjustments — 工期調整列表 */
scheduleAdjustmentsRouter.get('/', asyncHandler(scheduleAdjustmentController.list.bind(scheduleAdjustmentController)))

/** POST /api/v1/projects/:projectId/schedule-adjustments — 新增工期調整 */
scheduleAdjustmentsRouter.post('/', asyncHandler(scheduleAdjustmentController.create.bind(scheduleAdjustmentController)))

/** PATCH /api/v1/projects/:projectId/schedule-adjustments/:id — 更新工期調整 */
scheduleAdjustmentsRouter.patch('/:id', asyncHandler(scheduleAdjustmentController.update.bind(scheduleAdjustmentController)))

/** DELETE /api/v1/projects/:projectId/schedule-adjustments/:id — 刪除工期調整 */
scheduleAdjustmentsRouter.delete('/:id', asyncHandler(scheduleAdjustmentController.delete.bind(scheduleAdjustmentController)))
