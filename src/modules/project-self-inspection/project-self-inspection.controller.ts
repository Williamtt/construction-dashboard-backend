import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { projectSelfInspectionService } from './project-self-inspection.service.js'
import {
  createProjectSelfInspectionRecordSchema,
  updateProjectSelfInspectionRecordSchema,
} from '../../schemas/self-inspection-record.js'
import { importProjectSelfInspectionTemplateSchema } from '../../schemas/project-self-inspection-link.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

function getProjectId(req: Request): string {
  const id = req.params.projectId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少專案 ID')
}

function getTemplateId(req: Request): string {
  const id = req.params.templateId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少樣板 ID')
}

function getRecordId(req: Request): string {
  const id = req.params.recordId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少紀錄 ID')
}

export const projectSelfInspectionController = {
  async listTemplates(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const data = await projectSelfInspectionService.listTemplates(projectId, user)
    res.status(200).json({ data })
  },

  async listAvailableTemplates(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const data = await projectSelfInspectionService.listAvailableTemplates(projectId, user)
    res.status(200).json({ data })
  },

  async listImportCatalog(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const data = await projectSelfInspectionService.listImportCatalog(projectId, user)
    res.status(200).json({ data })
  },

  async importTemplate(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const parsed = importProjectSelfInspectionTemplateSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const data = await projectSelfInspectionService.importTemplate(
      projectId,
      parsed.data.templateId,
      user
    )
    res.status(201).json({ data })
  },

  async removeTemplateFromProject(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const templateId = getTemplateId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    await projectSelfInspectionService.removeTemplateFromProject(projectId, templateId, user)
    res.status(204).send()
  },

  async getTemplate(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const templateId = getTemplateId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const data = await projectSelfInspectionService.getTemplateForProject(projectId, templateId, user)
    res.status(200).json({ data })
  },

  async listRecords(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const templateId = getTemplateId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20))
    const { items, total, page: p, limit: l } = await projectSelfInspectionService.listRecords(
      projectId,
      templateId,
      user,
      { page, limit }
    )
    res.status(200).json({
      data: items,
      meta: { page: p, limit: l, total },
    })
  },

  async createRecord(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const templateId = getTemplateId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const parsed = createProjectSelfInspectionRecordSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const data = await projectSelfInspectionService.createRecord(
      projectId,
      templateId,
      user,
      parsed.data.filledPayload
    )
    res.status(201).json({ data })
  },

  async getRecord(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const templateId = getTemplateId(req)
    const recordId = getRecordId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const data = await projectSelfInspectionService.getRecord(projectId, templateId, recordId, user)
    if (!data) {
      throw new AppError(404, 'NOT_FOUND', '找不到該查驗紀錄')
    }
    res.status(200).json({ data })
  },

  async updateRecord(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const templateId = getTemplateId(req)
    const recordId = getRecordId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const parsed = updateProjectSelfInspectionRecordSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const data = await projectSelfInspectionService.updateRecord(
      projectId,
      templateId,
      recordId,
      user,
      parsed.data.filledPayload
    )
    res.status(200).json({ data })
  },

  async deleteRecord(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const templateId = getTemplateId(req)
    const recordId = getRecordId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    await projectSelfInspectionService.deleteRecord(projectId, templateId, recordId, user)
    res.status(204).send()
  },
}
