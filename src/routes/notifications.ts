import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { notificationsController } from '../modules/notifications/index.js'

export const notificationsRouter = Router()

notificationsRouter.get('/', asyncHandler(notificationsController.list.bind(notificationsController)))
notificationsRouter.get('/unread-count', asyncHandler(notificationsController.unreadCount.bind(notificationsController)))
notificationsRouter.patch('/read-all', asyncHandler(notificationsController.markAllRead.bind(notificationsController)))
notificationsRouter.patch('/:id/read', asyncHandler(notificationsController.markRead.bind(notificationsController)))
