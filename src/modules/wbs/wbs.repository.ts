import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

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
  isProjectRoot: boolean
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
  isProjectRoot: true,
  createdAt: true,
  updatedAt: true,
} as const

function decimalToNumber(v: unknown): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  if (typeof (v as { toNumber?: () => number }).toNumber === 'function') return (v as { toNumber: () => number }).toNumber()
  return Number(v)
}

function mapRow(row: {
  variableCost: unknown
} & Omit<WbsNodeRecord, 'variableCost'>): WbsNodeRecord {
  return {
    ...row,
    variableCost: row.variableCost != null ? decimalToNumber(row.variableCost) : null,
  }
}

function descendantIds(flat: WbsNodeRecord[], nodeId: string): string[] {
  const ids: string[] = []
  function collect(pid: string) {
    for (const n of flat) {
      if (n.parentId === pid) {
        ids.push(n.id)
        collect(n.id)
      }
    }
  }
  collect(nodeId)
  return ids
}

export const wbsRepository = {
  async findManyByProjectId(projectId: string): Promise<WbsNodeRecord[]> {
    const rows = await prisma.wbsNode.findMany({
      where: { projectId, ...notDeleted },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      select,
    })
    return rows.map((r) => mapRow(r))
  },

  async findById(id: string): Promise<WbsNodeRecord | null> {
    const row = await prisma.wbsNode.findFirst({
      where: { id, ...notDeleted },
      select,
    })
    if (!row) return null
    return mapRow(row)
  },

  async create(data: {
    projectId: string
    parentId: string | null
    code: string
    name: string
    sortOrder: number
    startDate?: Date | null
    durationDays?: number | null
    isProjectRoot?: boolean
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
        isProjectRoot: data.isProjectRoot ?? false,
      },
      select,
    })
    return mapRow(row)
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
    const n = await prisma.wbsNode.updateMany({
      where: { id, ...notDeleted },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.parentId !== undefined && { parentId: data.parentId }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.durationDays !== undefined && { durationDays: data.durationDays }),
        ...(data.variableCost !== undefined && { variableCost: data.variableCost }),
      },
    })
    if (n.count === 0) throw new Error('WBS_NODE_NOT_FOUND_OR_DELETED')
    const row = await prisma.wbsNode.findFirst({ where: { id, ...notDeleted }, select })
    if (!row) throw new Error('WBS_NODE_NOT_FOUND_OR_DELETED')
    return mapRow(row)
  },

  /** 子樹軟刪除（含根）；先移除節點資源連結 */
  async softDeleteSubtree(projectId: string, rootId: string, deletedById: string): Promise<void> {
    const flat = await prisma.wbsNode.findMany({
      where: { projectId, ...notDeleted },
      select: { id: true, parentId: true },
    })
    const asRecords = flat as WbsNodeRecord[]
    const desc = descendantIds(asRecords, rootId)
    const ids = [rootId, ...desc]
    await prisma.wbsNodeResource.deleteMany({ where: { wbsNodeId: { in: ids } } })
    await prisma.wbsNode.updateMany({
      where: { id: { in: ids }, projectId, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },

  async countChildren(parentId: string | null, projectId: string): Promise<number> {
    return prisma.wbsNode.count({
      where: { projectId, parentId, ...notDeleted },
    })
  },

  async findManyByProjectIdWithResources(projectId: string): Promise<
    (WbsNodeRecord & {
      resources: { id: string; name: string; type: string; unit: string; unitCost: number; quantity: number }[]
    })[]
  > {
    const rows = await prisma.wbsNode.findMany({
      where: { projectId, ...notDeleted },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      select: {
        ...select,
        resourceLinks: {
          where: { resource: notDeleted },
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
        ...mapRow({ ...node, variableCost: vc }),
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
    await prisma.wbsNode.updateMany({
      where: { id: wbsNodeId, ...notDeleted },
      data: { variableCost: total },
    })
  },
}
