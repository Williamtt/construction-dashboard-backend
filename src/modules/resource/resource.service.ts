import { prisma } from '../../lib/db.js'
import { AppError } from '../../shared/errors.js'
import { resourceRepository, type ProjectResourceRecord } from './resource.repository.js'
import type {
  CreateProjectResourceBody,
  UpdateProjectResourceBody,
} from '../../schemas/resource.js'

type AuthUser = {
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

async function ensureProjectAccess(projectId: string, user: AuthUser): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true },
  })
  if (!project) throw new AppError(404, 'NOT_FOUND', '找不到該專案')
  if (user.systemRole !== 'platform_admin' && project.tenantId !== user.tenantId) {
    throw new AppError(403, 'FORBIDDEN', '無權限操作此專案的資源')
  }
}

const VALID_TYPES = ['labor', 'equipment', 'material'] as const

function assertValidType(type: string): asserts type is (typeof VALID_TYPES)[number] {
  if (!VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    throw new AppError(400, 'BAD_REQUEST', '無效的資源類型')
  }
}

export const resourceService = {
  async list(
    projectId: string,
    type: string,
    user: AuthUser
  ): Promise<ProjectResourceRecord[]> {
    await ensureProjectAccess(projectId, user)
    assertValidType(type)
    return resourceRepository.findManyByProjectAndType(projectId, type)
  },

  async create(
    projectId: string,
    body: CreateProjectResourceBody,
    user: AuthUser
  ): Promise<ProjectResourceRecord> {
    await ensureProjectAccess(projectId, user)
    return resourceRepository.create({
      projectId,
      type: body.type,
      name: body.name.trim(),
      unit: body.unit.trim(),
      unitCost: body.unitCost,
      capacityType: body.capacityType?.trim() ?? null,
      dailyCapacity: body.dailyCapacity ?? null,
      description: body.description?.trim() ?? null,
    })
  },

  async update(
    projectId: string,
    id: string,
    body: UpdateProjectResourceBody,
    user: AuthUser
  ): Promise<ProjectResourceRecord> {
    await ensureProjectAccess(projectId, user)
    const existing = await resourceRepository.findById(id)
    if (!existing || existing.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該資源')
    }
    return resourceRepository.update(id, {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.unit !== undefined && { unit: body.unit.trim() }),
      ...(body.unitCost !== undefined && { unitCost: body.unitCost }),
      ...(body.capacityType !== undefined && {
        capacityType: body.capacityType?.trim() ?? null,
      }),
      ...(body.dailyCapacity !== undefined && {
        dailyCapacity: body.dailyCapacity ?? null,
      }),
      ...(body.description !== undefined && {
        description: body.description?.trim() ?? null,
      }),
    })
  },

  async delete(projectId: string, id: string, user: AuthUser): Promise<void> {
    await ensureProjectAccess(projectId, user)
    const existing = await resourceRepository.findById(id)
    if (!existing || existing.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該資源')
    }
    await resourceRepository.delete(id)
  },
}
