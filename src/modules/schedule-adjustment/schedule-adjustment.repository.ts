import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

export type ScheduleAdjustmentItem = {
  id: string
  projectId: string
  applyDate: Date
  type: string
  applyDays: number
  approvedDays: number
  status: string
  createdAt: Date
  updatedAt: Date
}

const select = {
  id: true,
  projectId: true,
  applyDate: true,
  type: true,
  applyDays: true,
  approvedDays: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const

export const scheduleAdjustmentRepository = {
  async findManyByProjectId(projectId: string): Promise<ScheduleAdjustmentItem[]> {
    const rows = await prisma.projectScheduleAdjustment.findMany({
      where: { projectId, ...notDeleted },
      orderBy: { applyDate: 'desc' },
      select,
    })
    return rows as ScheduleAdjustmentItem[]
  },

  async findById(id: string): Promise<ScheduleAdjustmentItem | null> {
    const row = await prisma.projectScheduleAdjustment.findUnique({
      where: { id },
      select,
    })
    return row as ScheduleAdjustmentItem | null
  },

  async create(data: {
    projectId: string
    applyDate: Date
    type: string
    applyDays: number
    approvedDays: number
    status: string
  }): Promise<ScheduleAdjustmentItem> {
    const row = await prisma.projectScheduleAdjustment.create({
      data: {
        projectId: data.projectId,
        applyDate: data.applyDate,
        type: data.type,
        applyDays: data.applyDays,
        approvedDays: data.approvedDays,
        status: data.status,
      },
      select,
    })
    return row as ScheduleAdjustmentItem
  },

  async update(
    id: string,
    data: Partial<{
      applyDate: Date
      type: string
      applyDays: number
      approvedDays: number
      status: string
    }>
  ): Promise<ScheduleAdjustmentItem> {
    const n = await prisma.projectScheduleAdjustment.updateMany({
      where: { id, ...notDeleted },
      data: {
        ...(data.applyDate !== undefined && { applyDate: data.applyDate }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.applyDays !== undefined && { applyDays: data.applyDays }),
        ...(data.approvedDays !== undefined && { approvedDays: data.approvedDays }),
        ...(data.status !== undefined && { status: data.status }),
      },
    })
    if (n.count === 0) throw new Error('SCHEDULE_ADJUSTMENT_NOT_FOUND_OR_DELETED')
    const row = await prisma.projectScheduleAdjustment.findFirst({
      where: { id, ...notDeleted },
      select,
    })
    if (!row) throw new Error('SCHEDULE_ADJUSTMENT_NOT_FOUND_OR_DELETED')
    return row as ScheduleAdjustmentItem
  },

  async delete(id: string, deletedById: string): Promise<void> {
    await prisma.projectScheduleAdjustment.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}
