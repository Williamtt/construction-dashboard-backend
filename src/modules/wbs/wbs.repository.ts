import { prisma } from '../../lib/db.js'

export type WbsNodeRecord = {
  id: string
  projectId: string
  parentId: string | null
  code: string
  name: string
  sortOrder: number
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
  createdAt: true,
  updatedAt: true,
} as const

export const wbsRepository = {
  async findManyByProjectId(projectId: string): Promise<WbsNodeRecord[]> {
    const rows = await prisma.wbsNode.findMany({
      where: { projectId },
      orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }],
      select,
    })
    return rows as WbsNodeRecord[]
  },

  async findById(id: string): Promise<WbsNodeRecord | null> {
    const row = await prisma.wbsNode.findUnique({
      where: { id },
      select,
    })
    return row as WbsNodeRecord | null
  },

  async create(data: {
    projectId: string
    parentId: string | null
    code: string
    name: string
    sortOrder: number
  }): Promise<WbsNodeRecord> {
    const row = await prisma.wbsNode.create({
      data: {
        projectId: data.projectId,
        parentId: data.parentId,
        code: data.code,
        name: data.name,
        sortOrder: data.sortOrder,
      },
      select,
    })
    return row as WbsNodeRecord
  },

  async update(
    id: string,
    data: Partial<{ name: string; code: string; parentId: string | null; sortOrder: number }>
  ): Promise<WbsNodeRecord> {
    const row = await prisma.wbsNode.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.parentId !== undefined && { parentId: data.parentId }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      select,
    })
    return row as WbsNodeRecord
  },

  async delete(id: string): Promise<void> {
    await prisma.wbsNode.delete({ where: { id } })
  },

  async countChildren(parentId: string | null, projectId: string): Promise<number> {
    return prisma.wbsNode.count({
      where: { projectId, parentId },
    })
  },
}
