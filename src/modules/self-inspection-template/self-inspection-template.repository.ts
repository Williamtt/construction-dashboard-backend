import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/db.js'

const templateSelect = {
  id: true,
  tenantId: true,
  name: true,
  description: true,
  status: true,
  headerConfig: true,
  createdAt: true,
  updatedAt: true,
} as const

export type SelfInspectionTemplateRow = {
  id: string
  tenantId: string
  name: string
  description: string | null
  status: string
  headerConfig: Prisma.JsonValue | null
  createdAt: Date
  updatedAt: Date
}

const blockSelect = {
  id: true,
  templateId: true,
  title: true,
  description: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const

export type SelfInspectionBlockRow = {
  id: string
  templateId: string
  title: string
  description: string | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

const itemSelect = {
  id: true,
  blockId: true,
  categoryLabel: true,
  itemName: true,
  standardText: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} as const

export type SelfInspectionBlockItemRow = {
  id: string
  blockId: string
  categoryLabel: string
  itemName: string
  standardText: string
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

export type SelfInspectionBlockWithItems = SelfInspectionBlockRow & {
  items: SelfInspectionBlockItemRow[]
}

export const selfInspectionTemplateRepository = {
  async findManyByTenant(tenantId: string, args: { status?: string }) {
    const where = {
      tenantId,
      ...(args.status ? { status: args.status } : {}),
    }
    return prisma.selfInspectionTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        ...templateSelect,
        _count: { select: { blocks: true } },
      },
    })
  },

  async findById(id: string) {
    return prisma.selfInspectionTemplate.findUnique({
      where: { id },
      select: templateSelect,
    }) as Promise<SelfInspectionTemplateRow | null>
  },

  async create(data: {
    tenantId: string
    name: string
    description: string | null
    status: string
    headerConfig?: Prisma.InputJsonValue | typeof Prisma.JsonNull
  }) {
    return prisma.selfInspectionTemplate.create({
      data: {
        tenantId: data.tenantId,
        name: data.name,
        description: data.description,
        status: data.status,
        ...(data.headerConfig !== undefined && { headerConfig: data.headerConfig }),
      },
      select: templateSelect,
    }) as Promise<SelfInspectionTemplateRow>
  },

  async update(
    id: string,
    data: Partial<{
      name: string
      description: string | null
      status: string
      headerConfig: Prisma.InputJsonValue | typeof Prisma.JsonNull
    }>
  ) {
    return prisma.selfInspectionTemplate.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.headerConfig !== undefined && { headerConfig: data.headerConfig }),
      },
      select: templateSelect,
    }) as Promise<SelfInspectionTemplateRow>
  },

  async delete(id: string) {
    await prisma.selfInspectionTemplate.delete({ where: { id } })
  },
}

export const selfInspectionBlockRepository = {
  async findManyByTemplateIdWithItems(templateId: string): Promise<SelfInspectionBlockWithItems[]> {
    const rows = await prisma.selfInspectionTemplateBlock.findMany({
      where: { templateId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        ...blockSelect,
        items: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: itemSelect,
        },
      },
    })
    return rows as SelfInspectionBlockWithItems[]
  },

  async findManyByTemplateId(templateId: string) {
    return prisma.selfInspectionTemplateBlock.findMany({
      where: { templateId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: blockSelect,
    }) as Promise<SelfInspectionBlockRow[]>
  },

  async findById(id: string) {
    return prisma.selfInspectionTemplateBlock.findUnique({
      where: { id },
      select: blockSelect,
    }) as Promise<SelfInspectionBlockRow | null>
  },

  async countByTemplateId(templateId: string) {
    return prisma.selfInspectionTemplateBlock.count({ where: { templateId } })
  },

  async maxSortOrder(templateId: string): Promise<number> {
    const agg = await prisma.selfInspectionTemplateBlock.aggregate({
      where: { templateId },
      _max: { sortOrder: true },
    })
    return agg._max.sortOrder ?? -1
  },

  async create(data: {
    templateId: string
    title: string
    description: string | null
    sortOrder: number
  }) {
    return prisma.selfInspectionTemplateBlock.create({
      data,
      select: blockSelect,
    }) as Promise<SelfInspectionBlockRow>
  },

  async update(
    id: string,
    data: Partial<{ title: string; description: string | null; sortOrder: number }>
  ) {
    return prisma.selfInspectionTemplateBlock.update({
      where: { id },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      select: blockSelect,
    }) as Promise<SelfInspectionBlockRow>
  },

  async delete(id: string) {
    await prisma.selfInspectionTemplateBlock.delete({ where: { id } })
  },
}

export const selfInspectionBlockItemRepository = {
  async findById(id: string) {
    return prisma.selfInspectionTemplateBlockItem.findUnique({
      where: { id },
      select: itemSelect,
    }) as Promise<SelfInspectionBlockItemRow | null>
  },

  async maxSortOrder(blockId: string): Promise<number> {
    const agg = await prisma.selfInspectionTemplateBlockItem.aggregate({
      where: { blockId },
      _max: { sortOrder: true },
    })
    return agg._max.sortOrder ?? -1
  },

  async create(data: {
    blockId: string
    categoryLabel: string
    itemName: string
    standardText: string
    sortOrder: number
  }) {
    return prisma.selfInspectionTemplateBlockItem.create({
      data,
      select: itemSelect,
    }) as Promise<SelfInspectionBlockItemRow>
  },

  async update(
    id: string,
    data: Partial<{
      categoryLabel: string
      itemName: string
      standardText: string
      sortOrder: number
    }>
  ) {
    return prisma.selfInspectionTemplateBlockItem.update({
      where: { id },
      data: {
        ...(data.categoryLabel !== undefined && { categoryLabel: data.categoryLabel }),
        ...(data.itemName !== undefined && { itemName: data.itemName }),
        ...(data.standardText !== undefined && { standardText: data.standardText }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
      select: itemSelect,
    }) as Promise<SelfInspectionBlockItemRow>
  },

  async delete(id: string) {
    await prisma.selfInspectionTemplateBlockItem.delete({ where: { id } })
  },
}
