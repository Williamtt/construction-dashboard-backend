import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/db.js'

const recordSelectList = {
  id: true,
  projectId: true,
  templateId: true,
  filledPayload: true,
  filledById: true,
  createdAt: true,
  updatedAt: true,
  filledBy: { select: { id: true, name: true, email: true } },
} as const

const recordSelectDetail = {
  ...recordSelectList,
  structureSnapshot: true,
} as const

export type SelfInspectionRecordListRow = {
  id: string
  projectId: string
  templateId: string
  filledPayload: Prisma.JsonValue
  filledById: string | null
  createdAt: Date
  updatedAt: Date
  filledBy: { id: string; name: string | null; email: string } | null
}

export type SelfInspectionRecordRow = SelfInspectionRecordListRow & {
  structureSnapshot: Prisma.JsonValue | null
}

export const projectSelfInspectionRepository = {
  async countByProjectAndTemplateIds(projectId: string, templateIds: string[]) {
    if (templateIds.length === 0) return new Map<string, number>()
    const rows = await prisma.selfInspectionRecord.groupBy({
      by: ['templateId'],
      where: { projectId, templateId: { in: templateIds } },
      _count: { _all: true },
    })
    return new Map(rows.map((r) => [r.templateId, r._count._all]))
  },

  async findManyByProjectAndTemplate(
    projectId: string,
    templateId: string,
    args: { skip: number; take: number }
  ) {
    return prisma.selfInspectionRecord.findMany({
      where: { projectId, templateId },
      orderBy: { createdAt: 'desc' },
      skip: args.skip,
      take: args.take,
      select: recordSelectList,
    }) as Promise<SelfInspectionRecordListRow[]>
  },

  async countByProjectAndTemplate(projectId: string, templateId: string) {
    return prisma.selfInspectionRecord.count({ where: { projectId, templateId } })
  },

  async findById(recordId: string) {
    return prisma.selfInspectionRecord.findUnique({
      where: { id: recordId },
      select: recordSelectDetail,
    }) as Promise<SelfInspectionRecordRow | null>
  },

  async create(data: {
    projectId: string
    templateId: string
    filledPayload: Prisma.InputJsonValue
    structureSnapshot: Prisma.InputJsonValue
    filledById: string | null
  }) {
    return prisma.selfInspectionRecord.create({
      data: {
        projectId: data.projectId,
        templateId: data.templateId,
        filledPayload: data.filledPayload,
        structureSnapshot: data.structureSnapshot,
        filledById: data.filledById,
      },
      select: recordSelectDetail,
    }) as Promise<SelfInspectionRecordRow>
  },
}

const templateBriefSelect = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const

export const projectSelfInspectionLinkRepository = {
  async findLinkedTemplateIds(projectId: string) {
    const rows = await prisma.projectSelfInspectionTemplateLink.findMany({
      where: { projectId },
      select: { templateId: true },
    })
    return rows.map((r) => r.templateId)
  },

  async findLinksWithTemplates(projectId: string) {
    return prisma.projectSelfInspectionTemplateLink.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        template: { select: templateBriefSelect },
      },
    })
  },

  async exists(projectId: string, templateId: string) {
    const row = await prisma.projectSelfInspectionTemplateLink.findUnique({
      where: {
        projectId_templateId: { projectId, templateId },
      },
    })
    return row != null
  },

  async create(projectId: string, templateId: string) {
    return prisma.projectSelfInspectionTemplateLink.create({
      data: { projectId, templateId },
      select: { createdAt: true },
    })
  },

  async delete(projectId: string, templateId: string) {
    await prisma.projectSelfInspectionTemplateLink.delete({
      where: {
        projectId_templateId: { projectId, templateId },
      },
    })
  },
}
