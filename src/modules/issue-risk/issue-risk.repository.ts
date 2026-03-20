import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

export type IssueRiskRecord = {
  id: string
  projectId: string
  description: string
  assigneeId: string | null
  urgency: string
  status: string
  createdAt: Date
  updatedAt: Date
}

export type IssueRiskWithRelations = IssueRiskRecord & {
  assignee: { id: string; name: string | null; email: string } | null
  wbsLinks: { wbsNode: { id: string; code: string; name: string } }[]
}

const selectBase = {
  id: true,
  projectId: true,
  description: true,
  assigneeId: true,
  urgency: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const

export const issueRiskRepository = {
  async findManyByProjectId(projectId: string): Promise<IssueRiskWithRelations[]> {
    const rows = await prisma.projectIssueRisk.findMany({
      where: { projectId, ...notDeleted },
      orderBy: { createdAt: 'desc' },
      select: {
        ...selectBase,
        assignee: {
          select: { id: true, name: true, email: true },
        },
        wbsLinks: {
          where: { wbsNode: notDeleted },
          select: {
            wbsNode: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    })
    return rows as IssueRiskWithRelations[]
  },

  async findById(id: string): Promise<IssueRiskWithRelations | null> {
    const row = await prisma.projectIssueRisk.findFirst({
      where: { id, ...notDeleted },
      select: {
        ...selectBase,
        assignee: {
          select: { id: true, name: true, email: true },
        },
        wbsLinks: {
          where: { wbsNode: notDeleted },
          select: {
            wbsNode: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    })
    return row as IssueRiskWithRelations | null
  },

  async create(data: {
    projectId: string
    description: string
    assigneeId: string | null
    urgency: string
    status: string
    wbsNodeIds: string[]
  }): Promise<IssueRiskRecord> {
    const { wbsNodeIds, ...rest } = data
    const row = await prisma.projectIssueRisk.create({
      data: {
        ...rest,
        wbsLinks:
          wbsNodeIds.length > 0
            ? { create: wbsNodeIds.map((wbsNodeId) => ({ wbsNodeId })) }
            : undefined,
      },
      select: selectBase,
    })
    return row as IssueRiskRecord
  },

  async update(
    id: string,
    data: Partial<{
      description: string
      assigneeId: string | null
      urgency: string
      status: string
    }> & { wbsNodeIds?: string[] }
  ): Promise<IssueRiskRecord> {
    const { wbsNodeIds, ...rest } = data
    if (wbsNodeIds !== undefined) {
      await prisma.projectIssueRiskWbsNode.deleteMany({ where: { issueRiskId: id } })
      if (wbsNodeIds.length > 0) {
        await prisma.projectIssueRiskWbsNode.createMany({
          data: wbsNodeIds.map((wbsNodeId) => ({ issueRiskId: id, wbsNodeId })),
        })
      }
    }
    const n = await prisma.projectIssueRisk.updateMany({
      where: { id, ...notDeleted },
      data: rest,
    })
    if (n.count === 0) throw new Error('ISSUE_RISK_NOT_FOUND_OR_DELETED')
    const row = await prisma.projectIssueRisk.findFirst({
      where: { id, ...notDeleted },
      select: selectBase,
    })
    if (!row) throw new Error('ISSUE_RISK_NOT_FOUND_OR_DELETED')
    return row as IssueRiskRecord
  },

  async delete(id: string, deletedById: string): Promise<void> {
    await prisma.projectIssueRiskWbsNode.deleteMany({ where: { issueRiskId: id } })
    await prisma.projectIssueRisk.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}
