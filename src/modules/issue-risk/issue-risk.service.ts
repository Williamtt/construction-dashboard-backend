import { prisma } from '../../lib/db.js'
import { AppError } from '../../shared/errors.js'
import { notDeleted } from '../../shared/soft-delete.js'
import { issueRiskRepository, type IssueRiskWithRelations } from './issue-risk.repository.js'
import { wbsRepository } from '../wbs/wbs.repository.js'
import type { CreateIssueRiskBody, UpdateIssueRiskBody } from '../../schemas/issue-risk.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

async function ensureProjectAccess(projectId: string, user: AuthUser): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, ...notDeleted },
    select: { tenantId: true },
  })
  if (!project) throw new AppError(404, 'NOT_FOUND', '找不到該專案')
  if (user.systemRole !== 'platform_admin' && project.tenantId !== user.tenantId) {
    throw new AppError(403, 'FORBIDDEN', '無權限操作此專案的議題風險')
  }
}

/** 取得專案內「沒有子節點」的 WBS 節點 id 集合（葉節點才可選為影像任務） */
async function getLeafWbsNodeIds(projectId: string): Promise<Set<string>> {
  const all = await wbsRepository.findManyByProjectId(projectId)
  const hasChildren = new Set<string>()
  for (const n of all) {
    if (n.parentId) hasChildren.add(n.parentId)
  }
  const leafIds = new Set<string>()
  for (const n of all) {
    if (!hasChildren.has(n.id)) leafIds.add(n.id)
  }
  return leafIds
}

async function validateWbsNodeIds(
  projectId: string,
  wbsNodeIds: string[],
  leafIds: Set<string>
): Promise<void> {
  for (const id of wbsNodeIds) {
    if (!leafIds.has(id)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        '影像任務僅能選擇沒有子項目的 WBS 節點（葉節點）'
      )
    }
  }
  if (wbsNodeIds.length === 0) return
  const nodes = await prisma.wbsNode.findMany({
    where: { id: { in: wbsNodeIds }, projectId, ...notDeleted },
    select: { id: true },
  })
  if (nodes.length !== wbsNodeIds.length) {
    throw new AppError(400, 'VALIDATION_ERROR', '部分 WBS 節點不屬於此專案或不存在')
  }
}

export const issueRiskService = {
  async list(projectId: string, user: AuthUser): Promise<IssueRiskWithRelations[]> {
    await ensureProjectAccess(projectId, user)
    return issueRiskRepository.findManyByProjectId(projectId)
  },

  async create(projectId: string, body: CreateIssueRiskBody, user: AuthUser) {
    await ensureProjectAccess(projectId, user)
    const leafIds = await getLeafWbsNodeIds(projectId)
    await validateWbsNodeIds(projectId, body.wbsNodeIds ?? [], leafIds)
    const assigneeId = body.assigneeId ?? null
    if (assigneeId) {
      const member = await prisma.projectMember.findFirst({
        where: { projectId, userId: assigneeId, ...notDeleted },
        select: { status: true },
      })
      if (!member || member.status !== 'active') {
        throw new AppError(400, 'VALIDATION_ERROR', '負責人須為專案成員')
      }
    }
    const created = await issueRiskRepository.create({
      projectId,
      description: body.description.trim(),
      assigneeId,
      urgency: body.urgency ?? 'medium',
      status: body.status ?? 'open',
      wbsNodeIds: body.wbsNodeIds ?? [],
    })
    const full = await issueRiskRepository.findById(created.id)
    return full ?? created
  },

  async update(
    projectId: string,
    id: string,
    body: UpdateIssueRiskBody,
    user: AuthUser
  ) {
    await ensureProjectAccess(projectId, user)
    const existing = await issueRiskRepository.findById(id)
    if (!existing || existing.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該議題風險')
    }
    const wbsNodeIds = body.wbsNodeIds
    if (wbsNodeIds !== undefined) {
      const leafIds = await getLeafWbsNodeIds(projectId)
      await validateWbsNodeIds(projectId, wbsNodeIds, leafIds)
    }
    if (body.assigneeId !== undefined && body.assigneeId) {
      const member = await prisma.projectMember.findFirst({
        where: { projectId, userId: body.assigneeId, ...notDeleted },
        select: { status: true },
      })
      if (!member || member.status !== 'active') {
        throw new AppError(400, 'VALIDATION_ERROR', '負責人須為專案成員')
      }
    }
    await issueRiskRepository.update(id, {
      description: body.description?.trim(),
      assigneeId: body.assigneeId,
      urgency: body.urgency,
      status: body.status,
      wbsNodeIds,
    })
    const full = await issueRiskRepository.findById(id)
    return full!
  },

  async delete(projectId: string, id: string, user: AuthUser): Promise<void> {
    await ensureProjectAccess(projectId, user)
    const existing = await issueRiskRepository.findById(id)
    if (!existing || existing.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該議題風險')
    }
    await issueRiskRepository.delete(id, user.id)
  },

  async getById(projectId: string, id: string, user: AuthUser) {
    await ensureProjectAccess(projectId, user)
    const row = await issueRiskRepository.findById(id)
    if (!row || row.projectId !== projectId) return null
    return row
  },
}
