import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import * as aiTutorService from './ai-tutor.service.js'

export const aiTutorController = {
  /** POST /api/v1/ai-tutor/chat */
  async chat(req: Request, res: Response) {
    const user = req.user as { id: string }
    if (!user?.id) throw new AppError(401, 'UNAUTHORIZED', '未登入')

    const { message, page_context } = req.body as { message?: string; page_context?: string }
    if (!message?.trim()) {
      throw new AppError(400, 'VALIDATION_ERROR', '請輸入問題')
    }

    const result = await aiTutorService.chat(user.id, message.trim(), page_context)
    res.status(200).json({ data: result })
  },

  /** GET /api/v1/ai-tutor/history */
  async history(req: Request, res: Response) {
    const user = req.user as { id: string }
    if (!user?.id) throw new AppError(401, 'UNAUTHORIZED', '未登入')

    const data = await aiTutorService.getHistory(user.id)
    res.status(200).json({ data })
  },

  /** POST /api/v1/ai-tutor/new */
  async newConversation(req: Request, res: Response) {
    const user = req.user as { id: string }
    if (!user?.id) throw new AppError(401, 'UNAUTHORIZED', '未登入')

    const data = await aiTutorService.newConversation(user.id)
    res.status(200).json({ data })
  },
}
