import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { projectMemberService } from './project-member.service.js'
import { addProjectMemberSchema, setProjectMemberStatusSchema } from '../../schemas/project-member.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

function toMemberDto(m: { id: string; projectId: string; userId: string; role: string; status: string; createdAt: Date; updatedAt: Date; user: { id: string; email: string; name: string | null; systemRole: string; memberType: string; status: string } }) {
  return {
    id: m.id,
    projectId: m.projectId,
    userId: m.userId,
    role: m.role,
    status: m.status,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    user: {
      id: m.user.id,
      email: m.user.email,
      name: m.user.name,
      systemRole: m.user.systemRole,
      memberType: m.user.memberType,
      status: m.user.status,
    },
  }
}

export const projectMemberController = {
  async list(req: Request, res: Response) {
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const list = await projectMemberService.list(projectId, user)
    res.status(200).json({
      data: list.map(toMemberDto),
    })
  },

  async listAvailable(req: Request, res: Response) {
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100))
    const list = await projectMemberService.listAvailable(projectId, user, limit)
    res.status(200).json({ data: list })
  },

  async add(req: Request, res: Response) {
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const parsed = addProjectMemberSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '欄位驗證失敗',
          details: parsed.error.flatten(),
        },
      })
      return
    }
    const member = await projectMemberService.add(projectId, parsed.data, user)
    res.status(201).json({ data: toMemberDto(member) })
  },

  async remove(req: Request, res: Response) {
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const userId = req.params.userId as string
    await projectMemberService.remove(projectId, userId, user)
    res.status(200).json({ data: { ok: true } })
  },

  async setStatus(req: Request, res: Response) {
    const user = req.user as AuthUser | undefined
    if (!user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const userId = req.params.userId as string
    const parsed = setProjectMemberStatusSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '欄位驗證失敗',
          details: parsed.error.flatten(),
        },
      })
      return
    }
    const member = await projectMemberService.setStatus(projectId, userId, parsed.data.status, user)
    res.status(200).json({ data: toMemberDto(member) })
  },
}
