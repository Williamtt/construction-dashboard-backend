/**
 * @routeGuard projectPermissionsInService — 見 wbs.service ensureWbs（assertProjectModuleAction）
 */
import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { wbsController } from '../modules/wbs/index.js'

export const wbsRouter = Router({ mergeParams: true })

/** GET /api/v1/projects/:projectId/wbs — WBS 樹狀列表 */
wbsRouter.get('/', asyncHandler(wbsController.list.bind(wbsController)))

/** POST /api/v1/projects/:projectId/wbs — 新增節點（body: parentId?, name） */
wbsRouter.post('/', asyncHandler(wbsController.create.bind(wbsController)))

/** PATCH .../wbs/:id/move — 拖移（須在 :id 之前註冊） */
wbsRouter.patch('/:id/move', asyncHandler(wbsController.move.bind(wbsController)))

/** PATCH /api/v1/projects/:projectId/wbs/:id — 更新節點（body: name?） */
wbsRouter.patch('/:id', asyncHandler(wbsController.update.bind(wbsController)))

/** DELETE /api/v1/projects/:projectId/wbs/:id — 刪除節點（含子節點） */
wbsRouter.delete('/:id', asyncHandler(wbsController.delete.bind(wbsController)))
