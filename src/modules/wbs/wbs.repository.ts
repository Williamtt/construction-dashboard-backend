import { prisma } from '../../lib/db.js'

export type WbsNodeRecord = {
  id: string
  projectId: string
  parentId: string | null
  code: string
  name: string
  sortOrder: number
  startDate: Date | null
  durationDays: number | null
  variableCost: number | null
  createdAt: Date
  updatedAt: Date
}

const select = {
  id: true,
  projectId: true,
  parentId: true,
  code: true,
  name: true,
  sortOrder: true,
  startDate: true,
  durationDays: true,
  variableCost: true,
  createdAt: true,
  updatedAt: true,
} as const

function decimalToNumber(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v)
}

export const wbsRepository = {
  async findManyByProjectId(projectId: string): Promise<WbsNodeRecord[]> {
    const rows = await prisma.wbsNode.findMany({
      where: { projectId },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      select,
    })
    return rows.map((r) => ({ ...r, variableCost: r.variableCost != null ? decimalToNumber(r.variableCost) : null })) as WbsNodeRecord[]
  },

  async findById(id: string): Promise<WbsNodeRecord | null> {
    const row = await prisma.wbsNode.findUnique({
      where: { id },
      select,
    })
    if (!row) return null
    return { ...row, variableCost: row.variableCost != null ? decimalToNumber(row.variableCost) : null } as WbsNodeRecord
  },

  async create(data: {
    projectId: string
    parentId: string | null
    code: string
    name: string
    sortOrder: number
    startDate?: Date | null
    durationDays?: number | null
  }): Promise<WbsNodeRecord> {
    const row = await prisma.wbsNode.create({
      data: {
        projectId: data.projectId,
        parentId: data.parentId,
        code: data.code,
        name: data.name,
        sortOrder: data.sortOrder,
        startDate: data.startDate ?? undefined,
        durationDays: data.durationDays ?? undefined,
      },
      select,
    })
    return { ...row, variableCost: row.variableCost != null ? decimalToNumber(row.variableCost) : null } as WbsNodeRecord
  },

  async update(
    id: string,
    data: Partial<{
      name: string
      code: string
      parentId: string | null
      sortOrder: number
      startDate: Date | null
      durationDays: number | null
      variableCost: number | null
    }>
  ): Promise<WbsNodeRecord> {
    const row = await prisma.wbsNode.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.parentId !== undefined && { parentId: data.parentId }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.durationDays !== undefined && { durationDays: data.durationDays }),
        ...(data.variableCost !== undefined && { variableCost: data.variableCost }),
      },
      select,
    })
    return { ...row, variableCost: row.variableCost != null ? decimalToNumber(row.variableCost) : null } as WbsNodeRecord
  },

  async delete(id: string): Promise<void> {
    await prisma.wbsNode.delete({ where: { id } })
  },

  async countChildren(parentId: string | null, projectId: string): Promise<number> {
    return prisma.wbsNode.count({
      where: { projectId, parentId },
    })
  },

  /** 資源回傳型別：含 type（人機料）、unit、unitCost、quantity 供前端分組與變動成本顯示 */
  async findManyByProjectIdWithResources(projectId: string): Promise<
    (WbsNodeRecord & {
      resources: { id: string; name: string; type: string; unit: string; unitCost: number; quantity: number }[]
    })[]
  > {
    const rows = await prisma.wbsNode.findMany({
      where: { projectId },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      select: {
        ...select,
        resourceLinks: {
          select: {
            quantity: true,
            resource: {
              select: { id: true, name: true, type: true, unit: true, unitCost: true },
            },
          },
        },
      },
    })
    return rows.map((r) => {
      const { resourceLinks, variableCost: vc, ...node } = r
      return {
        ...node,
        variableCost: vc != null ? decimalToNumber(vc) : null,
        resources: resourceLinks.map((l) => ({
          id: l.resource.id,
          name: l.resource.name,
          type: l.resource.type,
          unit: l.resource.unit,
          unitCost: l.resource.unitCost,
          quantity: l.quantity != null ? decimalToNumber(l.quantity) : 1,
        })),
      }
    })
  },

  /** 設定節點資源與用量；若未傳 quantity 則預設 1 */
  async setNodeResourceAssignments(
    wbsNodeId: string,
    assignments: { projectResourceId: string; quantity?: number }[]
  ): Promise<void> {
    await prisma.wbsNodeResource.deleteMany({ where: { wbsNodeId } })
    if (assignments.length > 0) {
      await prisma.wbsNodeResource.createMany({
        data: assignments.map((a) => ({
          wbsNodeId,
          projectResourceId: a.projectResourceId,
          quantity: a.quantity ?? 1,
        })),
        skipDuplicates: true,
      })
    }
  },

  /** 依資源單價×用量計算變動成本並寫回節點 */
  async recomputeAndUpdateVariableCost(wbsNodeId: string): Promise<void> {
    const links = await prisma.wbsNodeResource.findMany({
      where: { wbsNodeId },
      select: { quantity: true, resource: { select: { unitCost: true } } },
    })
    let total = 0
    for (const l of links) {
      const qty = l.quantity != null ? decimalToNumber(l.quantity) : 1
      const cost = l.resource.unitCost
      total += cost * qty
    }
    await prisma.wbsNode.update({
      where: { id: wbsNodeId },
      data: { variableCost: total },
    })
  },
}
