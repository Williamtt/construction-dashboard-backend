import type { Request, Response } from 'express'
import {
  createWbsNodeSchema,
  updateWbsNodeSchema,
  moveWbsNodeSchema,
} from '../../schemas/wbs.js'
import { wbsService } from './wbs.service.js'
import { AppError } from '../../shared/errors.js'

function getProjectId(req: Request): string {
  const id = req.params.projectId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少專案 ID')
}

function getId(req: Request, param = 'id'): string {
  const id = req.params[param]
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', `缺少參數 ${param}`)
}

export const wbsController = {
  async list(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user!
    const tree = await wbsService.list(projectId, user)
    res.status(200).json({ data: tree })
  },

  async create(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user!
    const parsed = createWbsNodeSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await wbsService.create(projectId, parsed.data, user)
    res.status(201).json({ data: item })
  },

  async update(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = getId(req)
    const user = req.user!
    const parsed = updateWbsNodeSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await wbsService.update(projectId, id, parsed.data, user)
    res.status(200).json({ data: item })
  },

  async delete(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = getId(req)
    const user = req.user!
    await wbsService.delete(projectId, id, user)
    res.status(200).json({ data: { ok: true } })
  },

  async move(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = getId(req)
    const user = req.user!
    const parsed = moveWbsNodeSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const tree = await wbsService.move(projectId, id, parsed.data, user)
    res.status(200).json({ data: tree })
  },
}
