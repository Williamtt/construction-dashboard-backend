import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { issueRiskService } from './issue-risk.service.js'
import {
  createIssueRiskSchema,
  updateIssueRiskSchema,
} from '../../schemas/issue-risk.js'
import type { IssueRiskWithRelations } from './issue-risk.repository.js'

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

function getId(req: Request, param = 'id'): string {
  const id = req.params[param]
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', `缺少參數 ${param}`)
}

function toDto(row: IssueRiskWithRelations) {
  return {
    id: row.id,
    projectId: row.projectId,
    description: row.description,
    assigneeId: row.assigneeId,
    assignee: row.assignee
      ? {
          id: row.assignee.id,
          name: row.assignee.name,
          email: row.assignee.email,
        }
      : null,
    urgency: row.urgency,
    status: row.status,
    wbsTasks: row.wbsLinks.map((l) => ({
      id: l.wbsNode.id,
      code: l.wbsNode.code,
      name: l.wbsNode.name,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const issueRiskController = {
  async list(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const list = await issueRiskService.list(projectId, user)
    res.status(200).json({
      data: list.map(toDto),
    })
  },

  async getById(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = getId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const row = await issueRiskService.getById(projectId, id, user)
    if (!row) {
      throw new AppError(404, 'NOT_FOUND', '找不到該議題風險')
    }
    res.status(200).json({ data: toDto(row) })
  },

  async create(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const parsed = createIssueRiskSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await issueRiskService.create(projectId, parsed.data, user)
    res.status(201).json({ data: toDto(item as IssueRiskWithRelations) })
  },

  async update(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = getId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const parsed = updateIssueRiskSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const item = await issueRiskService.update(projectId, id, parsed.data, user)
    res.status(200).json({ data: toDto(item) })
  },

  async delete(req: Request, res: Response) {
    const projectId = getProjectId(req)
    const id = getId(req)
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    await issueRiskService.delete(projectId, id, user)
    res.status(200).json({ data: { ok: true } })
  },
}
