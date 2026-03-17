import { prisma } from '../../lib/db.js'

/** Prisma delegate for ProjectResource; throw clear error if client was not regenerated. */
function getProjectResourceDelegate() {
  const delegate = (prisma as { projectResource?: unknown }).projectResource
  if (!delegate || typeof (delegate as { findMany?: unknown }).findMany !== 'function') {
    throw new Error(
      'Prisma Client 尚未包含 ProjectResource 模型。請在後端目錄執行：npx prisma generate，然後重新啟動伺服器。'
    )
  }
  return delegate as {
    findMany: (args: unknown) => Promise<ProjectResourceRecord[]>
    findUnique: (args: unknown) => Promise<ProjectResourceRecord | null>
    create: (args: unknown) => Promise<ProjectResourceRecord>
    update: (args: unknown) => Promise<ProjectResourceRecord>
    delete: (args: unknown) => Promise<void>
  }
}

export type ProjectResourceRecord = {
  id: string
  projectId: string
  type: string
  name: string
  unit: string
  unitCost: number
  capacityType: string | null
  dailyCapacity: number | null
  vendor: string | null
  description: string | null
  createdAt: Date
  updatedAt: Date
}

const select = {
  id: true,
  projectId: true,
  type: true,
  name: true,
  unit: true,
  unitCost: true,
  capacityType: true,
  dailyCapacity: true,
  vendor: true,
  description: true,
  createdAt: true,
  updatedAt: true,
} as const

export const resourceRepository = {
  async findManyByProjectAndType(
    projectId: string,
    type: string
  ): Promise<ProjectResourceRecord[]> {
    const projectResource = getProjectResourceDelegate()
    const rows = await projectResource.findMany({
      where: { projectId, type },
      orderBy: { createdAt: 'asc' },
      select,
    })
    return rows as ProjectResourceRecord[]
  },

  async findById(id: string): Promise<ProjectResourceRecord | null> {
    const projectResource = getProjectResourceDelegate()
    const row = await projectResource.findUnique({
      where: { id },
      select,
    })
    return row as ProjectResourceRecord | null
  },

  async create(data: {
    projectId: string
    type: string
    name: string
    unit: string
    unitCost: number
    capacityType?: string | null
    dailyCapacity?: number | null
    vendor?: string | null
    description?: string | null
  }): Promise<ProjectResourceRecord> {
    const projectResource = getProjectResourceDelegate()
    const row = await projectResource.create({
      data: {
        projectId: data.projectId,
        type: data.type,
        name: data.name,
        unit: data.unit,
        unitCost: data.unitCost,
        capacityType: data.capacityType ?? null,
        dailyCapacity: data.dailyCapacity ?? null,
        vendor: data.vendor ?? null,
        description: data.description ?? null,
      },
      select,
    })
    return row as ProjectResourceRecord
  },

  async update(
    id: string,
    data: Partial<{
      name: string
      unit: string
      unitCost: number
      capacityType: string | null
      dailyCapacity: number | null
      vendor: string | null
      description: string | null
    }>
  ): Promise<ProjectResourceRecord> {
    const projectResource = getProjectResourceDelegate()
    const row = await projectResource.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.unit !== undefined && { unit: data.unit }),
        ...(data.unitCost !== undefined && { unitCost: data.unitCost }),
        ...(data.capacityType !== undefined && { capacityType: data.capacityType }),
        ...(data.dailyCapacity !== undefined && { dailyCapacity: data.dailyCapacity }),
        ...(data.vendor !== undefined && { vendor: data.vendor }),
        ...(data.description !== undefined && { description: data.description }),
      },
      select,
    })
    return row as ProjectResourceRecord
  },

  async delete(id: string): Promise<void> {
    const projectResource = getProjectResourceDelegate()
    await projectResource.delete({ where: { id } })
  },
}
