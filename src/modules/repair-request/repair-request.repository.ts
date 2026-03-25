import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

const repairSelect = {
  id: true,
  projectId: true,
  customerName: true,
  contactPhone: true,
  repairContent: true,
  unitLabel: true,
  remarks: true,
  problemCategory: true,
  isSecondRepair: true,
  deliveryDate: true,
  repairDate: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const

export type RepairListItem = {
  id: string
  projectId: string
  customerName: string
  contactPhone: string
  repairContent: string
  unitLabel: string | null
  remarks: string | null
  problemCategory: string
  isSecondRepair: boolean
  deliveryDate: Date | null
  repairDate: Date | null
  status: string
  createdAt: Date
  updatedAt: Date
}

function searchWhereClause(search: string): Record<string, unknown> {
  const q = search.trim()
  if (!q) return {}
  return {
    OR: [
      { customerName: { contains: q, mode: 'insensitive' as const } },
      { contactPhone: { contains: q, mode: 'insensitive' as const } },
      { repairContent: { contains: q, mode: 'insensitive' as const } },
      { problemCategory: { contains: q, mode: 'insensitive' as const } },
      { unitLabel: { contains: q, mode: 'insensitive' as const } },
      { remarks: { contains: q, mode: 'insensitive' as const } },
    ],
  }
}

export const repairRequestRepository = {
  async findManyByProject(
    projectId: string,
    args: { statusIn?: string[]; search?: string; skip?: number; take?: number }
  ) {
    const searchPart =
      args.search && args.search.trim() ? searchWhereClause(args.search) : {}
    const where = {
      projectId,
      ...notDeleted,
      ...(args.statusIn?.length ? { status: { in: args.statusIn } } : {}),
      ...searchPart,
    }
    return prisma.repairRequest.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: args.skip ?? 0,
      take: args.take ?? 100,
      select: repairSelect,
    }) as Promise<RepairListItem[]>
  },

  async countByProject(projectId: string, statusIn?: string[], search?: string) {
    const searchPart = search && search.trim() ? searchWhereClause(search) : {}
    const where = {
      projectId,
      ...notDeleted,
      ...(statusIn?.length ? { status: { in: statusIn } } : {}),
      ...searchPart,
    }
    return prisma.repairRequest.count({ where })
  },

  async findById(id: string) {
    return prisma.repairRequest.findFirst({
      where: { id, ...notDeleted },
      select: repairSelect,
    }) as Promise<RepairListItem | null>
  },

  async create(data: {
    projectId: string
    customerName: string
    contactPhone: string
    repairContent: string
    unitLabel: string | null
    remarks: string | null
    problemCategory: string
    isSecondRepair: boolean
    deliveryDate: Date | null
    repairDate: Date | null
    status: string
  }) {
    return prisma.repairRequest.create({
      data: {
        projectId: data.projectId,
        customerName: data.customerName,
        contactPhone: data.contactPhone,
        repairContent: data.repairContent,
        unitLabel: data.unitLabel,
        remarks: data.remarks,
        problemCategory: data.problemCategory,
        isSecondRepair: data.isSecondRepair,
        deliveryDate: data.deliveryDate,
        repairDate: data.repairDate,
        status: data.status,
      },
      select: repairSelect,
    }) as Promise<RepairListItem>
  },

  async update(
    id: string,
    data: Partial<{
      customerName: string
      contactPhone: string
      repairContent: string
      unitLabel: string | null
      remarks: string | null
      problemCategory: string
      isSecondRepair: boolean
      deliveryDate: Date | null
      repairDate: Date | null
      status: string
    }>
  ) {
    const n = await prisma.repairRequest.updateMany({
      where: { id, ...notDeleted },
      data: {
        ...(data.customerName !== undefined && { customerName: data.customerName }),
        ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone }),
        ...(data.repairContent !== undefined && { repairContent: data.repairContent }),
        ...(data.unitLabel !== undefined && { unitLabel: data.unitLabel }),
        ...(data.remarks !== undefined && { remarks: data.remarks }),
        ...(data.problemCategory !== undefined && { problemCategory: data.problemCategory }),
        ...(data.isSecondRepair !== undefined && { isSecondRepair: data.isSecondRepair }),
        ...(data.deliveryDate !== undefined && { deliveryDate: data.deliveryDate }),
        ...(data.repairDate !== undefined && { repairDate: data.repairDate }),
        ...(data.status !== undefined && { status: data.status }),
      },
    })
    if (n.count === 0) throw new Error('REPAIR_NOT_FOUND_OR_DELETED')
    const row = await prisma.repairRequest.findFirst({
      where: { id, ...notDeleted },
      select: repairSelect,
    })
    if (!row) throw new Error('REPAIR_NOT_FOUND_OR_DELETED')
    return row as RepairListItem
  },

  async delete(id: string, deletedById: string) {
    await prisma.repairExecutionRecord.updateMany({
      where: { repairId: id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
    await prisma.repairRequest.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}

const repairRecordSelect = {
  id: true,
  repairId: true,
  content: true,
  recordedById: true,
  createdAt: true,
  recordedBy: { select: { id: true, name: true, email: true } },
} as const

export type RepairExecutionRecordRow = {
  id: string
  repairId: string
  content: string
  recordedById: string | null
  createdAt: Date
  recordedBy: { id: string; name: string | null; email: string } | null
}

export const repairExecutionRecordRepository = {
  async findById(recordId: string) {
    return prisma.repairExecutionRecord.findFirst({
      where: { id: recordId, ...notDeleted },
      select: repairRecordSelect,
    }) as Promise<RepairExecutionRecordRow | null>
  },

  async findManyByRepairId(repairId: string) {
    return prisma.repairExecutionRecord.findMany({
      where: { repairId, ...notDeleted },
      orderBy: { createdAt: 'desc' },
      select: repairRecordSelect,
    }) as Promise<RepairExecutionRecordRow[]>
  },

  async create(data: { repairId: string; content: string; recordedById: string | null }) {
    return prisma.repairExecutionRecord.create({
      data: {
        repairId: data.repairId,
        content: data.content,
        recordedById: data.recordedById,
      },
      select: repairRecordSelect,
    }) as Promise<RepairExecutionRecordRow>
  },

  async updateContent(recordId: string, content: string): Promise<RepairExecutionRecordRow | null> {
    const n = await prisma.repairExecutionRecord.updateMany({
      where: { id: recordId, ...notDeleted },
      data: { content },
    })
    if (n.count === 0) return null
    return repairExecutionRecordRepository.findById(recordId)
  },
}
