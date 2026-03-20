import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

export type DrawingNodeRecord = {
  id: string
  projectId: string
  parentId: string | null
  kind: string
  name: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

function descendantIds(flat: DrawingNodeRecord[], nodeId: string): string[] {
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

export const drawingNodeRepository = {
  async findManyByProjectId(projectId: string): Promise<DrawingNodeRecord[]> {
    return prisma.drawingNode.findMany({
      where: { projectId, ...notDeleted },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
    })
  },

  async findById(id: string): Promise<DrawingNodeRecord | null> {
    return prisma.drawingNode.findFirst({ where: { id, ...notDeleted } })
  },

  async create(data: {
    projectId: string
    parentId: string | null
    kind: string
    name: string
    sortOrder: number
  }): Promise<DrawingNodeRecord> {
    return prisma.drawingNode.create({ data })
  },

  async update(id: string, data: { name?: string; parentId?: string | null; sortOrder?: number }) {
    const n = await prisma.drawingNode.updateMany({
      where: { id, ...notDeleted },
      data,
    })
    if (n.count === 0) throw new Error('DRAWING_NODE_NOT_FOUND_OR_DELETED')
    const row = await prisma.drawingNode.findFirst({ where: { id, ...notDeleted } })
    if (!row) throw new Error('DRAWING_NODE_NOT_FOUND_OR_DELETED')
    return row
  },

  /** 子樹內所有節點（含根）標記軟刪除 */
  async softDeleteSubtree(projectId: string, rootId: string, deletedById: string): Promise<void> {
    const flat = await prisma.drawingNode.findMany({
      where: { projectId, ...notDeleted },
    })
    const desc = descendantIds(flat, rootId)
    const ids = [rootId, ...desc]
    await prisma.drawingNode.updateMany({
      where: { id: { in: ids }, projectId, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}
