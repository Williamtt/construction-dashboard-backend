import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { alertsController } from '../modules/alerts/index.js'

export const alertsRouter = Router()

/** GET /api/v1/alerts/current — 即時警報（假資料含六類：地震、豪雨、高溫、颱風、空污、其他） */
alertsRouter.get('/current', asyncHandler(alertsController.current.bind(alertsController)))
/** GET /api/v1/alerts/history — 歷史警報（query: projectId?, startDate, endDate, limit?） */
alertsRouter.get('/history', asyncHandler(alertsController.history.bind(alertsController)))
