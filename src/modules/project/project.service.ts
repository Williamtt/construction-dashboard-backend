import { AppError } from '../../shared/errors.js'
import { projectRepository, type ProjectListItem } from './project.repository.js'
import type { CreateProjectBody, UpdateProjectBody } from '../../schemas/project.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

function parseDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export const projectService = {
  async list(
    args: { page: number; limit: number; skip: number },
    user: AuthUser
  ): Promise<{ list: ProjectListItem[]; total: number }> {
    const tenantIdFilter =
      user.systemRole === 'platform_admin'
        ? undefined
        : user.tenantId ?? undefined
    if (user.systemRole !== 'platform_admin' && user.tenantId == null) {
      return { list: [], total: 0 }
    }
    const [list, total] = await Promise.all([
      projectRepository.findMany({
        skip: args.skip,
        take: args.limit,
        tenantId: tenantIdFilter,
      }),
      projectRepository.count(tenantIdFilter),
    ])
    return { list, total }
  },

  async getById(id: string, user: AuthUser): Promise<ProjectListItem> {
    const project = await projectRepository.findById(id)
    if (!project) {
      throw new AppError(404, 'NOT_FOUND', '找不到該專案')
    }
    if (user.systemRole !== 'platform_admin' && project.tenantId !== user.tenantId) {
      throw new AppError(403, 'FORBIDDEN', '無權限存取此專案')
    }
    return project
  },

  async create(data: CreateProjectBody, user: AuthUser): Promise<ProjectListItem> {
    if (user.systemRole === 'project_user') {
      throw new AppError(403, 'FORBIDDEN', '僅管理員可新增專案')
    }
    const tenantId =
      user.systemRole === 'tenant_admin'
        ? user.tenantId
        : (data.tenantId ?? null)
    if (user.systemRole === 'tenant_admin' && !tenantId) {
      throw new AppError(400, 'BAD_REQUEST', '租戶管理員所屬租戶不明')
    }
    return projectRepository.create({
      name: data.name,
      description: data.description ?? null,
      code: data.code ?? null,
      status: data.status ?? 'active',
      tenantId,
    })
  },

  async update(id: string, data: UpdateProjectBody, user: AuthUser): Promise<ProjectListItem> {
    const project = await projectRepository.findById(id)
    if (!project) {
      throw new AppError(404, 'NOT_FOUND', '找不到該專案')
    }
    if (user.systemRole !== 'platform_admin' && project.tenantId !== user.tenantId) {
      throw new AppError(403, 'FORBIDDEN', '無權限編輯此專案')
    }
    const payload: Parameters<typeof projectRepository.update>[1] = {}
    if (data.name !== undefined) payload.name = data.name
    if (data.description !== undefined) payload.description = data.description ?? null
    if (data.code !== undefined) payload.code = data.code ?? null
    if (data.status !== undefined) payload.status = data.status
    if (data.designUnit !== undefined) payload.designUnit = data.designUnit ?? null
    if (data.supervisionUnit !== undefined) payload.supervisionUnit = data.supervisionUnit ?? null
    if (data.contractor !== undefined) payload.contractor = data.contractor ?? null
    if (data.summary !== undefined) payload.summary = data.summary ?? null
    if (data.benefits !== undefined) payload.benefits = data.benefits ?? null
    if (data.startDate !== undefined) payload.startDate = parseDate(data.startDate)
    if (data.plannedEndDate !== undefined) payload.plannedEndDate = parseDate(data.plannedEndDate)
    if (data.revisedEndDate !== undefined) payload.revisedEndDate = parseDate(data.revisedEndDate)
    if (data.siteManager !== undefined) payload.siteManager = data.siteManager ?? null
    if (data.contactPhone !== undefined) payload.contactPhone = data.contactPhone ?? null
    if (data.projectStaff !== undefined) payload.projectStaff = data.projectStaff ?? null
    return projectRepository.update(id, payload)
  },
}
