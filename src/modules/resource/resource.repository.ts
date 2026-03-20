import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

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
    const rows = await prisma.projectResource.findMany({
      where: { projectId, type, ...notDeleted },
      orderBy: { createdAt: 'asc' },
      select,
    })
    return rows as ProjectResourceRecord[]
  },

  async findById(id: string): Promise<ProjectResourceRecord | null> {
    const row = await prisma.projectResource.findFirst({
      where: { id, ...notDeleted },
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
    const row = await prisma.projectResource.create({
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
    const n = await prisma.projectResource.updateMany({
      where: { id, ...notDeleted },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.unit !== undefined && { unit: data.unit }),
        ...(data.unitCost !== undefined && { unitCost: data.unitCost }),
        ...(data.capacityType !== undefined && { capacityType: data.capacityType }),
        ...(data.dailyCapacity !== undefined && { dailyCapacity: data.dailyCapacity }),
        ...(data.vendor !== undefined && { vendor: data.vendor }),
        ...(data.description !== undefined && { description: data.description }),
      },
    })
    if (n.count === 0) throw new Error('RESOURCE_NOT_FOUND_OR_DELETED')
    const row = await prisma.projectResource.findFirst({
      where: { id, ...notDeleted },
      select,
    })
    if (!row) throw new Error('RESOURCE_NOT_FOUND_OR_DELETED')
    return row as ProjectResourceRecord
  },

  async delete(id: string, deletedById: string): Promise<void> {
    await prisma.projectResource.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}
