/**
 * @routeGuard projectPermissionsInService — 見 repair-request.service assertProjectModuleAction
 */
import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { repairRequestController } from '../modules/repair-request/index.js'

export const repairRequestsRouter = Router({ mergeParams: true })

/** GET /api/v1/projects/:projectId/repair-requests — 報修列表（?status=、?q=關鍵字、分頁） */
repairRequestsRouter.get('/', asyncHandler(repairRequestController.list.bind(repairRequestController)))

/** POST /api/v1/projects/:projectId/repair-requests — 新增報修 */
repairRequestsRouter.post('/', asyncHandler(repairRequestController.create.bind(repairRequestController)))

/** GET /api/v1/projects/:projectId/repair-requests/:id/records — 報修紀錄列表（須在 /:id 前） */
repairRequestsRouter.get('/:id/records', asyncHandler(repairRequestController.listRecords.bind(repairRequestController)))

/** POST /api/v1/projects/:projectId/repair-requests/:id/records — 新增報修紀錄 */
repairRequestsRouter.post('/:id/records', asyncHandler(repairRequestController.createRecord.bind(repairRequestController)))

/** GET /api/v1/projects/:projectId/repair-requests/:id/records/:recordId — 單一報修紀錄（含照片） */
repairRequestsRouter.get(
  '/:id/records/:recordId',
  asyncHandler(repairRequestController.getRecord.bind(repairRequestController))
)

/** PATCH /api/v1/projects/:projectId/repair-requests/:id/records/:recordId — 更新報修執行紀錄內容 */
repairRequestsRouter.patch(
  '/:id/records/:recordId',
  asyncHandler(repairRequestController.updateRecord.bind(repairRequestController))
)

/** GET /api/v1/projects/:projectId/repair-requests/:id — 單一報修（含照片、附件） */
repairRequestsRouter.get('/:id', asyncHandler(repairRequestController.getById.bind(repairRequestController)))

/** PATCH /api/v1/projects/:projectId/repair-requests/:id — 更新報修 */
repairRequestsRouter.patch('/:id', asyncHandler(repairRequestController.update.bind(repairRequestController)))

/** DELETE /api/v1/projects/:projectId/repair-requests/:id — 刪除報修 */
repairRequestsRouter.delete('/:id', asyncHandler(repairRequestController.delete.bind(repairRequestController)))
