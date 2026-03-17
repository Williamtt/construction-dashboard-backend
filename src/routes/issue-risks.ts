import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { issueRiskController } from '../modules/issue-risk/index.js'

export const issueRisksRouter = Router({ mergeParams: true })

/** GET /api/v1/projects/:projectId/issue-risks — 議題風險列表 */
issueRisksRouter.get('/', asyncHandler(issueRiskController.list.bind(issueRiskController)))

/** GET /api/v1/projects/:projectId/issue-risks/:id — 單一議題風險 */
issueRisksRouter.get('/:id', asyncHandler(issueRiskController.getById.bind(issueRiskController)))

/** POST /api/v1/projects/:projectId/issue-risks — 新增議題風險 */
issueRisksRouter.post('/', asyncHandler(issueRiskController.create.bind(issueRiskController)))

/** PATCH /api/v1/projects/:projectId/issue-risks/:id — 更新議題風險 */
issueRisksRouter.patch('/:id', asyncHandler(issueRiskController.update.bind(issueRiskController)))

/** DELETE /api/v1/projects/:projectId/issue-risks/:id — 刪除議題風險 */
issueRisksRouter.delete('/:id', asyncHandler(issueRiskController.delete.bind(issueRiskController)))
