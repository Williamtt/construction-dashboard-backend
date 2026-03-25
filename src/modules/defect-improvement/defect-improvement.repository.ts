import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

const defectSelect = {
  id: true,
  projectId: true,
  description: true,
  discoveredBy: true,
  priority: true,
  floor: true,
  location: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const

export type DefectListItem = {
  id: string
  projectId: string
  description: string
  discoveredBy: string
  priority: string
  floor: string | null
  location: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}

function searchWhereClause(search: string): Record<string, unknown> {
  const q = search.trim()
  if (!q) return {}
  return {
    OR: [
      { description: { contains: q, mode: 'insensitive' as const } },
      { discoveredBy: { contains: q, mode: 'insensitive' as const } },
      ...(q.length >= 6 ? [{ id: { contains: q, mode: 'insensitive' as const } }] : []),
      { floor: { contains: q, mode: 'insensitive' as const } },
      { location: { contains: q, mode: 'insensitive' as const } },
    ],
  }
}

export const defectImprovementRepository = {
  async findManyByProject(
    projectId: string,
    args: { status?: string; search?: string; skip?: number; take?: number }
  ) {
    const searchPart =
      args.search && args.search.trim() ? searchWhereClause(args.search) : {}
    const where = {
      projectId,
      ...notDeleted,
      ...(args.status ? { status: args.status } : {}),
      ...searchPart,
    }
    return prisma.defectImprovement.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: args.skip ?? 0,
      take: args.take ?? 100,
      select: defectSelect,
    }) as Promise<DefectListItem[]>
  },

  async countByProject(projectId: string, status?: string, search?: string) {
    const searchPart = search && search.trim() ? searchWhereClause(search) : {}
    const where = {
      projectId,
      ...notDeleted,
      ...(status ? { status } : {}),
      ...searchPart,
    }
    return prisma.defectImprovement.count({ where })
  },

  async findById(id: string) {
    return prisma.defectImprovement.findFirst({
      where: { id, ...notDeleted },
      select: defectSelect,
    }) as Promise<DefectListItem | null>
  },

  async findByIdWithProject(id: string) {
    return prisma.defectImprovement.findFirst({
      where: { id, ...notDeleted },
      select: { ...defectSelect, projectId: true },
    })
  },

  async create(data: {
    projectId: string
    description: string
    discoveredBy: string
    priority: string
    floor: string | null
    location: string | null
    status: string
  }) {
    return prisma.defectImprovement.create({
      data: {
        projectId: data.projectId,
        description: data.description,
        discoveredBy: data.discoveredBy,
        priority: data.priority,
        floor: data.floor,
        location: data.location,
        status: data.status,
      },
      select: defectSelect,
    }) as Promise<DefectListItem>
  },

  async update(
    id: string,
    data: Partial<{
      description: string
      discoveredBy: string
      priority: string
      floor: string | null
      location: string | null
      status: string
    }>
  ) {
    const n = await prisma.defectImprovement.updateMany({
      where: { id, ...notDeleted },
      data: {
        ...(data.description !== undefined && { description: data.description }),
        ...(data.discoveredBy !== undefined && { discoveredBy: data.discoveredBy }),
        ...(data.priority !== undefined && { priority: data.priority }),
        ...(data.floor !== undefined && { floor: data.floor }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.status !== undefined && { status: data.status }),
      },
    })
    if (n.count === 0) {
      throw new Error('DEFECT_NOT_FOUND_OR_DELETED')
    }
    const row = await prisma.defectImprovement.findFirst({
      where: { id, ...notDeleted },
      select: defectSelect,
    })
    if (!row) throw new Error('DEFECT_NOT_FOUND_OR_DELETED')
    return row as DefectListItem
  },

  async delete(id: string, deletedById: string) {
    await prisma.defectExecutionRecord.updateMany({
      where: { defectId: id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
    await prisma.defectImprovement.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}

const recordSelect = {
  id: true,
  defectId: true,
  content: true,
  recordedById: true,
  createdAt: true,
  recordedBy: { select: { id: true, name: true, email: true } },
} as const

export type DefectExecutionRecordRow = {
  id: string
  defectId: string
  content: string
  recordedById: string | null
  createdAt: Date
  recordedBy: { id: string; name: string | null; email: string } | null
}

export const defectExecutionRecordRepository = {
  async findById(recordId: string) {
    return prisma.defectExecutionRecord.findFirst({
      where: { id: recordId, ...notDeleted },
      select: recordSelect,
    }) as Promise<DefectExecutionRecordRow | null>
  },

  async findManyByDefectId(defectId: string) {
    return prisma.defectExecutionRecord.findMany({
      where: { defectId, ...notDeleted },
      orderBy: { createdAt: 'desc' },
      select: recordSelect,
    }) as Promise<DefectExecutionRecordRow[]>
  },

  async create(data: {
    defectId: string
    content: string
    recordedById: string | null
  }) {
    return prisma.defectExecutionRecord.create({
      data: {
        defectId: data.defectId,
        content: data.content,
        recordedById: data.recordedById,
      },
      select: recordSelect,
    }) as Promise<DefectExecutionRecordRow>
  },

  async updateContent(recordId: string, content: string): Promise<DefectExecutionRecordRow | null> {
    const n = await prisma.defectExecutionRecord.updateMany({
      where: { id: recordId, ...notDeleted },
      data: { content },
    })
    if (n.count === 0) return null
    return defectExecutionRecordRepository.findById(recordId)
  },
}
