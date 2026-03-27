import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { replacePermissionModulesSchema, applyPermissionPresetSchema } from '../../schemas/project-permission.js'
import type { AuthUser } from '../../shared/project-access.js'
import { prisma } from '../../lib/db.js'
import { notDeleted } from '../../shared/soft-delete.js'
import { recordAuditMutation } from '../audit-log/audit-log.service.js'
import {
  getMyPermissionsMap,
  listProjectMemberOverrides,
  replaceProjectMemberOverrides,
  resetProjectMemberToTemplate,
  listTenantTemplate,
  replaceTenantTemplate,
  applyPresetToTenantTemplate,
} from './project-permission.service.js'

async function tenantIdForProject(projectId: string): Promise<string | null> {
  const p = await prisma.project.findFirst({
    where: { id: projectId, ...notDeleted },
    select: { tenantId: true },
  })
  return p?.tenantId ?? null
}

function actor(req: Request): AuthUser {
  const u = req.user as AuthUser | undefined
  if (!u) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
  return u
}

export const projectPermissionController = {
  async myPermissions(req: Request, res: Response) {
    const user = actor(req)
    const projectId = req.params.projectId as string
    const modules = await getMyPermissionsMap(projectId, user)
    res.status(200).json({ data: { modules } })
  },

  async listMemberProjectPermissions(req: Request, res: Response) {
    const user = actor(req)
    const projectId = req.params.projectId as string
    const targetUserId = req.params.userId as string
    const payload = await listProjectMemberOverrides(user, projectId, targetUserId)
    res.status(200).json({ data: payload })
  },

  async replaceMemberProjectPermissions(req: Request, res: Response) {
    const user = actor(req)
    const projectId = req.params.projectId as string
    const targetUserId = req.params.userId as string
    const parsed = replacePermissionModulesSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? '欄位驗證失敗',
          details: parsed.error.flatten(),
        },
      })
      return
    }
    const before = await listProjectMemberOverrides(user, projectId, targetUserId)
    const payload = await replaceProjectMemberOverrides(user, projectId, targetUserId, parsed.data.modules)
    const tenantId = await tenantIdForProject(projectId)
    await recordAuditMutation(req, {
      action: 'project.member_permissions.replace',
      resourceType: 'project_member_permissions',
      resourceId: `${projectId}:${targetUserId}`,
      tenantId,
      before,
      after: payload,
    })
    res.status(200).json({ data: payload })
  },

  async resetMemberToTemplate(req: Request, res: Response) {
    const user = actor(req)
    const projectId = req.params.projectId as string
    const targetUserId = req.params.userId as string
    const before = await listProjectMemberOverrides(user, projectId, targetUserId)
    const payload = await resetProjectMemberToTemplate(user, projectId, targetUserId)
    const tenantId = await tenantIdForProject(projectId)
    await recordAuditMutation(req, {
      action: 'project.member_permissions.reset_to_template',
      resourceType: 'project_member_permissions',
      resourceId: `${projectId}:${targetUserId}`,
      tenantId,
      before,
      after: payload,
    })
    res.status(200).json({ data: payload })
  },

  async getTenantTemplate(req: Request, res: Response) {
    const user = actor(req)
    const targetUserId = req.params.id as string
    const tenantId =
      (req.query.tenantId as string) || (user.systemRole === 'tenant_admin' ? user.tenantId : null)
    if (!tenantId) {
      throw new AppError(400, 'BAD_REQUEST', '請指定 tenantId（platform_admin 必填 query）')
    }
    const modules = await listTenantTemplate(user, tenantId, targetUserId)
    res.status(200).json({ data: { modules } })
  },

  async replaceTenantTemplate(req: Request, res: Response) {
    const user = actor(req)
    const targetUserId = req.params.id as string
    const tenantId =
      (req.query.tenantId as string) || (user.systemRole === 'tenant_admin' ? user.tenantId : null)
    if (!tenantId) {
      throw new AppError(400, 'BAD_REQUEST', '請指定 tenantId（platform_admin 必填 query）')
    }
    const parsed = replacePermissionModulesSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? '欄位驗證失敗',
          details: parsed.error.flatten(),
        },
      })
      return
    }
    const beforeModules = await listTenantTemplate(user, tenantId, targetUserId)
    const modules = await replaceTenantTemplate(user, tenantId, targetUserId, parsed.data.modules)
    await recordAuditMutation(req, {
      action: 'admin.user_permission_template.replace',
      resourceType: 'tenant_permission_template',
      resourceId: targetUserId,
      tenantId,
      before: { modules: beforeModules },
      after: { modules },
    })
    res.status(200).json({ data: { modules } })
  },

  async applyTenantPreset(req: Request, res: Response) {
    const user = actor(req)
    const targetUserId = req.params.id as string
    const tenantId =
      (req.query.tenantId as string) || (user.systemRole === 'tenant_admin' ? user.tenantId : null)
    if (!tenantId) {
      throw new AppError(400, 'BAD_REQUEST', '請指定 tenantId（platform_admin 必填 query）')
    }
    const parsed = applyPermissionPresetSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors[0]?.message ?? '欄位驗證失敗',
          details: parsed.error.flatten(),
        },
      })
      return
    }
    const beforeModules = await listTenantTemplate(user, tenantId, targetUserId)
    const modules = await applyPresetToTenantTemplate(user, tenantId, targetUserId, parsed.data.presetKey)
    await recordAuditMutation(req, {
      action: 'admin.user_permission_template.apply_preset',
      resourceType: 'tenant_permission_template',
      resourceId: targetUserId,
      tenantId,
      before: { modules: beforeModules, presetKey: null },
      after: { modules, presetKey: parsed.data.presetKey },
    })
    res.status(200).json({ data: { modules } })
  },
}
