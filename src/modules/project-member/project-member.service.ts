import { prisma } from '../../lib/db.js'
import { AppError } from '../../shared/errors.js'
import { notDeleted } from '../../shared/soft-delete.js'
import { projectMemberRepository, type ProjectMemberItem } from './project-member.repository.js'
import { projectRepository } from '../project/project.repository.js'
import type { AddProjectMemberBody } from '../../schemas/project-member.js'
import { projectPermissionRepository } from '../project-permission/project-permission.repository.js'
import { syncProjectMemberPermissionsFromTemplate } from '../project-permission/project-permission.service.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

/** 可檢視專案成員：platform_admin、同租戶 tenant_admin、或為該專案成員（且 status=active） */
async function ensureCanAccessProjectMembers(projectId: string, user: AuthUser): Promise<void> {
  if (user.systemRole === 'platform_admin') return
  const project = await projectRepository.findById(projectId)
  if (!project) throw new AppError(404, 'NOT_FOUND', '找不到該專案')
  if (user.systemRole === 'tenant_admin' && project.tenantId === user.tenantId) return
  const member = await prisma.projectMember.findFirst({
    where: { projectId, userId: user.id, ...notDeleted },
    select: { status: true },
  })
  if (!member || member.status !== 'active') {
    throw new AppError(403, 'FORBIDDEN', '非專案成員或已停用，無法檢視專案成員')
  }
}

/** 可新增/移除專案成員：platform_admin 或同租戶的 tenant_admin */
async function ensureCanManageProjectMembers(projectId: string, user: AuthUser): Promise<void> {
  if (user.systemRole === 'platform_admin') return
  if (user.systemRole !== 'tenant_admin' || !user.tenantId) {
    throw new AppError(403, 'FORBIDDEN', '僅租戶管理員或平台管理員可管理專案成員')
  }
  const project = await projectRepository.findById(projectId)
  if (!project) throw new AppError(404, 'NOT_FOUND', '找不到該專案')
  if (project.tenantId !== user.tenantId) {
    throw new AppError(403, 'FORBIDDEN', '僅能管理同租戶專案的成員')
  }
}

export const projectMemberService = {
  async list(projectId: string, user: AuthUser): Promise<ProjectMemberItem[]> {
    await ensureCanAccessProjectMembers(projectId, user)
    return projectMemberRepository.findManyByProjectId(projectId)
  },

  async listAvailable(projectId: string, user: AuthUser, limit = 100): Promise<{ id: string; email: string; name: string | null }[]> {
    await ensureCanManageProjectMembers(projectId, user)
    const project = await projectRepository.findById(projectId)
    if (!project) throw new AppError(404, 'NOT_FOUND', '找不到該專案')
    if (!project.tenantId) {
      throw new AppError(400, 'BAD_REQUEST', '此專案未綁定租戶，無法從租戶成員加入')
    }
    return projectMemberRepository.findTenantUsersNotInProject(projectId, project.tenantId, limit)
  },

  async add(projectId: string, data: AddProjectMemberBody, user: AuthUser): Promise<ProjectMemberItem> {
    await ensureCanManageProjectMembers(projectId, user)
    const project = await projectRepository.findById(projectId)
    if (!project) throw new AppError(404, 'NOT_FOUND', '找不到該專案')
    if (!project.tenantId) {
      throw new AppError(400, 'BAD_REQUEST', '此專案未綁定租戶，無法加入成員')
    }
    const targetUser = await prisma.user.findFirst({
      where: { id: data.userId, ...notDeleted },
      select: { id: true, tenantId: true, status: true },
    })
    if (!targetUser) throw new AppError(404, 'NOT_FOUND', '找不到該使用者')
    if (targetUser.tenantId !== project.tenantId) {
      throw new AppError(400, 'BAD_REQUEST', '僅能加入同租戶的成員')
    }
    if (targetUser.status !== 'active') {
      throw new AppError(400, 'BAD_REQUEST', '僅能加入使用中的成員')
    }
    const exists = await projectMemberRepository.exists(projectId, data.userId)
    if (exists) throw new AppError(409, 'CONFLICT', '該成員已在專案中')
    let createdRole: 'project_admin' | 'member' | 'viewer' = 'member'
    try {
      const row = await projectMemberRepository.create(projectId, data.userId, 'member')
      createdRole = row.role
    } catch (e) {
      if (e instanceof Error && e.message === 'PROJECT_MEMBER_ALREADY_ACTIVE') {
        throw new AppError(409, 'CONFLICT', '該成員已在專案中')
      }
      throw e
    }
    await syncProjectMemberPermissionsFromTemplate(projectId, data.userId, project.tenantId, createdRole)
    const list = await projectMemberRepository.findManyByProjectId(projectId)
    const added = list.find((m) => m.userId === data.userId)
    if (!added) throw new AppError(500, 'INTERNAL_ERROR', '新增後無法取得成員資料')
    return added
  },

  async remove(projectId: string, userId: string, user: AuthUser): Promise<void> {
    await ensureCanManageProjectMembers(projectId, user)
    const exists = await projectMemberRepository.exists(projectId, userId)
    if (!exists) throw new AppError(404, 'NOT_FOUND', '該使用者不是此專案成員')
    await projectPermissionRepository.deleteManyProjectUser(projectId, userId)
    await projectMemberRepository.deleteByProjectAndUser(projectId, userId, user.id)
  },

  async setStatus(
    projectId: string,
    userId: string,
    status: 'active' | 'suspended',
    user: AuthUser
  ): Promise<ProjectMemberItem> {
    await ensureCanManageProjectMembers(projectId, user)
    const exists = await projectMemberRepository.exists(projectId, userId)
    if (!exists) throw new AppError(404, 'NOT_FOUND', '該使用者不是此專案成員')
    const updated = await projectMemberRepository.updateStatus(projectId, userId, status)
    if (!updated) throw new AppError(500, 'INTERNAL_ERROR', '更新狀態失敗')
    return updated
  },
}
