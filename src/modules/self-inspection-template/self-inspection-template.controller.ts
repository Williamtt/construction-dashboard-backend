import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { selfInspectionTemplateService } from './self-inspection-template.service.js'
import {
  createSelfInspectionTemplateSchema,
  updateSelfInspectionTemplateSchema,
  createSelfInspectionBlockSchema,
  updateSelfInspectionBlockSchema,
  createSelfInspectionBlockItemSchema,
  updateSelfInspectionBlockItemSchema,
} from '../../schemas/self-inspection-template.js'

function getId(req: Request, param: string): string {
  const id = req.params[param]
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', `缺少參數 ${param}`)
}

export const selfInspectionTemplateController = {
  async list(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    const data = await selfInspectionTemplateService.list(user as never, { tenantId, status })
    res.status(200).json({ data })
  },

  async getById(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const id = getId(req, 'id')
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    const result = await selfInspectionTemplateService.getById(user as never, id, tenantId)
    res.status(200).json({ data: result })
  },

  async create(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const parsed = createSelfInspectionTemplateSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const bodyTenantId =
      typeof (req.body as { tenantId?: string }).tenantId === 'string'
        ? (req.body as { tenantId?: string }).tenantId
        : undefined
    const data = await selfInspectionTemplateService.create(user as never, parsed.data, bodyTenantId)
    res.status(201).json({ data })
  },

  async update(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const id = getId(req, 'id')
    const parsed = updateSelfInspectionTemplateSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    const data = await selfInspectionTemplateService.update(user as never, id, parsed.data, tenantId)
    res.status(200).json({ data })
  },

  async delete(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const id = getId(req, 'id')
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    await selfInspectionTemplateService.delete(user as never, id, tenantId)
    res.status(204).send()
  },

  async createBlock(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const templateId = getId(req, 'id')
    const parsed = createSelfInspectionBlockSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    const data = await selfInspectionTemplateService.createBlock(
      user as never,
      templateId,
      parsed.data,
      tenantId
    )
    res.status(201).json({ data })
  },

  async updateBlock(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const templateId = getId(req, 'id')
    const blockId = getId(req, 'blockId')
    const parsed = updateSelfInspectionBlockSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    const data = await selfInspectionTemplateService.updateBlock(
      user as never,
      templateId,
      blockId,
      parsed.data,
      tenantId
    )
    res.status(200).json({ data })
  },

  async deleteBlock(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const templateId = getId(req, 'id')
    const blockId = getId(req, 'blockId')
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    await selfInspectionTemplateService.deleteBlock(user as never, templateId, blockId, tenantId)
    res.status(204).send()
  },

  async createBlockItem(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const templateId = getId(req, 'id')
    const blockId = getId(req, 'blockId')
    const parsed = createSelfInspectionBlockItemSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    const data = await selfInspectionTemplateService.createBlockItem(
      user as never,
      templateId,
      blockId,
      parsed.data,
      tenantId
    )
    res.status(201).json({ data })
  },

  async updateBlockItem(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const templateId = getId(req, 'id')
    const blockId = getId(req, 'blockId')
    const itemId = getId(req, 'itemId')
    const parsed = updateSelfInspectionBlockItemSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    const data = await selfInspectionTemplateService.updateBlockItem(
      user as never,
      templateId,
      blockId,
      itemId,
      parsed.data,
      tenantId
    )
    res.status(200).json({ data })
  },

  async deleteBlockItem(req: Request, res: Response) {
    const user = req.user
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const templateId = getId(req, 'id')
    const blockId = getId(req, 'blockId')
    const itemId = getId(req, 'itemId')
    const tenantId = typeof req.query.tenantId === 'string' ? req.query.tenantId : undefined
    await selfInspectionTemplateService.deleteBlockItem(
      user as never,
      templateId,
      blockId,
      itemId,
      tenantId
    )
    res.status(204).send()
  },
}
