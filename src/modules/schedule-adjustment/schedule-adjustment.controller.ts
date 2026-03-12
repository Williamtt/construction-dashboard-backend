import type { Request, Response } from 'express'
import { createScheduleAdjustmentSchema, updateScheduleAdjustmentSchema } from '../../schemas/scheduleAdjustment.js'
import { scheduleAdjustmentService } from './schedule-adjustment.service.js'
import { AppError } from '../../shared/errors.js'

function getProjectId(req: Request): string {
  const id = req.params.projectId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少專案 ID')
}

export const scheduleAdjustmentController = {
  async list(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user!
    const list = await scheduleAdjustmentService.list(projectId, user)
    res.status(200).json({ data: list })
  },

  async create(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user!
    const parsed = createScheduleAdjustmentSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await scheduleAdjustmentService.create(projectId, parsed.data, user)
    res.status(201).json({ data: item })
  },

  async update(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = typeof req.params.id === 'string' ? req.params.id : Array.isArray(req.params.id) ? req.params.id[0] : ''
    if (!id) throw new AppError(400, 'BAD_REQUEST', '缺少工期調整 ID')
    const user = req.user!
    const parsed = updateScheduleAdjustmentSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await scheduleAdjustmentService.update(projectId, id, parsed.data, user)
    res.status(200).json({ data: item })
  },

  async delete(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = typeof req.params.id === 'string' ? req.params.id : Array.isArray(req.params.id) ? req.params.id[0] : ''
    if (!id) throw new AppError(400, 'BAD_REQUEST', '缺少工期調整 ID')
    const user = req.user!
    await scheduleAdjustmentService.delete(projectId, id, user)
    res.status(200).json({ data: { ok: true } })
  },
}
