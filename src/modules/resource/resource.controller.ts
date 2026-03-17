import type { Request, Response } from 'express'
import {
  createProjectResourceSchema,
  updateProjectResourceSchema,
} from '../../schemas/resource.js'
import { resourceService } from './resource.service.js'
import { AppError } from '../../shared/errors.js'

function getProjectId(req: Request): string {
  const id = req.params.projectId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少專案 ID')
}

function getResourceId(req: Request): string {
  const id = req.params.id
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少資源 ID')
}

function getType(req: Request): string {
  const type = req.query.type
  if (typeof type === 'string' && type) return type
  throw new AppError(400, 'BAD_REQUEST', '請提供查詢參數 type（labor | equipment | material）')
}

export const resourceController = {
  async list(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const type = getType(req)
    const user = req.user!
    const items = await resourceService.list(projectId, type, user)
    res.status(200).json({ data: items })
  },

  async create(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user!
    const parsed = createProjectResourceSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await resourceService.create(projectId, parsed.data, user)
    res.status(201).json({ data: item })
  },

  async update(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = getResourceId(req)
    const user = req.user!
    const parsed = updateProjectResourceSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await resourceService.update(projectId, id, parsed.data, user)
    res.status(200).json({ data: item })
  },

  async delete(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = getResourceId(req)
    const user = req.user!
    await resourceService.delete(projectId, id, user)
    res.status(200).json({ data: { ok: true } })
  },
}
