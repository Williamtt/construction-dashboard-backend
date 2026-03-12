import { prisma } from '../../lib/db.js'

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
      where: { projectId },
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
    const row = await prisma.projectScheduleAdjustment.update({
      where: { id },
      data: {
        ...(data.applyDate !== undefined && { applyDate: data.applyDate }),
        ...(data.type !== undefined && { type: data.type }),
        ...(data.applyDays !== undefined && { applyDays: data.applyDays }),
        ...(data.approvedDays !== undefined && { approvedDays: data.approvedDays }),
        ...(data.status !== undefined && { status: data.status }),
      },
      select,
    })
    return row as ScheduleAdjustmentItem
  },

  async delete(id: string): Promise<void> {
    await prisma.projectScheduleAdjustment.delete({ where: { id } })
  },
}
