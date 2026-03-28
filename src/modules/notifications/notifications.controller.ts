import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { listNotifications, getUnreadCount, markAsRead, markAllAsRead } from './notifications.service.js'

export const notificationsController = {
  /** GET /api/v1/notifications */
  async list(req: Request, res: Response) {
    const user = req.user as { id: string }
    if (!user?.id) throw new AppError(401, 'UNAUTHORIZED', '未登入')
    const limit = req.query.limit != null ? Math.min(Number(req.query.limit), 100) : 50
    const data = await listNotifications(user.id, limit)
    res.status(200).json({ data })
  },

  /** GET /api/v1/notifications/unread-count */
  async unreadCount(req: Request, res: Response) {
    const user = req.user as { id: string }
    if (!user?.id) throw new AppError(401, 'UNAUTHORIZED', '未登入')
    const count = await getUnreadCount(user.id)
    res.status(200).json({ count })
  },

  /** PATCH /api/v1/notifications/:id/read */
  async markRead(req: Request, res: Response) {
    const user = req.user as { id: string }
    if (!user?.id) throw new AppError(401, 'UNAUTHORIZED', '未登入')
    const id = String(req.params.id)
    await markAsRead(id, user.id)
    res.status(200).json({ success: true })
  },

  /** PATCH /api/v1/notifications/read-all */
  async markAllRead(req: Request, res: Response) {
    const user = req.user as { id: string }
    if (!user?.id) throw new AppError(401, 'UNAUTHORIZED', '未登入')
    await markAllAsRead(user.id)
    res.status(200).json({ success: true })
  },
}
