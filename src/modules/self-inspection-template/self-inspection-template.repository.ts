import type { Prisma } from '@prisma/client'
import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

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
      ...notDeleted,
      ...(args.status ? { status: args.status } : {}),
    }
    return prisma.selfInspectionTemplate.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        ...templateSelect,
        _count: { select: { blocks: { where: notDeleted } } },
      },
    })
  },

  async findById(id: string) {
    return prisma.selfInspectionTemplate.findFirst({
      where: { id, ...notDeleted },
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
    const n = await prisma.selfInspectionTemplate.updateMany({
      where: { id, ...notDeleted },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.headerConfig !== undefined && { headerConfig: data.headerConfig }),
      },
    })
    if (n.count === 0) throw new Error('SELF_INSPECTION_TEMPLATE_NOT_FOUND_OR_DELETED')
    const row = await prisma.selfInspectionTemplate.findFirst({
      where: { id, ...notDeleted },
      select: templateSelect,
    })
    if (!row) throw new Error('SELF_INSPECTION_TEMPLATE_NOT_FOUND_OR_DELETED')
    return row as SelfInspectionTemplateRow
  },

  async delete(id: string, deletedById: string) {
    const blocks = await prisma.selfInspectionTemplateBlock.findMany({
      where: { templateId: id, ...notDeleted },
      select: { id: true },
    })
    const blockIds = blocks.map((b) => b.id)
    if (blockIds.length > 0) {
      await prisma.selfInspectionTemplateBlockItem.updateMany({
        where: { blockId: { in: blockIds }, ...notDeleted },
        data: softDeleteSet(deletedById),
      })
    }
    await prisma.selfInspectionTemplateBlock.updateMany({
      where: { templateId: id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
    await prisma.selfInspectionTemplate.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}

export const selfInspectionBlockRepository = {
  async findManyByTemplateIdWithItems(templateId: string): Promise<SelfInspectionBlockWithItems[]> {
    const rows = await prisma.selfInspectionTemplateBlock.findMany({
      where: { templateId, ...notDeleted },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: {
        ...blockSelect,
        items: {
          where: notDeleted,
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: itemSelect,
        },
      },
    })
    return rows as SelfInspectionBlockWithItems[]
  },

  async findManyByTemplateId(templateId: string) {
    return prisma.selfInspectionTemplateBlock.findMany({
      where: { templateId, ...notDeleted },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: blockSelect,
    }) as Promise<SelfInspectionBlockRow[]>
  },

  async findById(id: string) {
    return prisma.selfInspectionTemplateBlock.findFirst({
      where: { id, ...notDeleted },
      select: blockSelect,
    }) as Promise<SelfInspectionBlockRow | null>
  },

  async countByTemplateId(templateId: string) {
    return prisma.selfInspectionTemplateBlock.count({ where: { templateId, ...notDeleted } })
  },

  async maxSortOrder(templateId: string): Promise<number> {
    const agg = await prisma.selfInspectionTemplateBlock.aggregate({
      where: { templateId, ...notDeleted },
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
    const n = await prisma.selfInspectionTemplateBlock.updateMany({
      where: { id, ...notDeleted },
      data: {
        ...(data.title !== undefined && { title: data.title }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    })
    if (n.count === 0) throw new Error('SELF_INSPECTION_BLOCK_NOT_FOUND_OR_DELETED')
    const row = await prisma.selfInspectionTemplateBlock.findFirst({
      where: { id, ...notDeleted },
      select: blockSelect,
    })
    if (!row) throw new Error('SELF_INSPECTION_BLOCK_NOT_FOUND_OR_DELETED')
    return row as SelfInspectionBlockRow
  },

  async delete(id: string, deletedById: string) {
    await prisma.selfInspectionTemplateBlockItem.updateMany({
      where: { blockId: id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
    await prisma.selfInspectionTemplateBlock.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}

export const selfInspectionBlockItemRepository = {
  async findById(id: string) {
    return prisma.selfInspectionTemplateBlockItem.findFirst({
      where: { id, ...notDeleted },
      select: itemSelect,
    }) as Promise<SelfInspectionBlockItemRow | null>
  },

  async maxSortOrder(blockId: string): Promise<number> {
    const agg = await prisma.selfInspectionTemplateBlockItem.aggregate({
      where: { blockId, ...notDeleted },
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
    const n = await prisma.selfInspectionTemplateBlockItem.updateMany({
      where: { id, ...notDeleted },
      data: {
        ...(data.categoryLabel !== undefined && { categoryLabel: data.categoryLabel }),
        ...(data.itemName !== undefined && { itemName: data.itemName }),
        ...(data.standardText !== undefined && { standardText: data.standardText }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    })
    if (n.count === 0) throw new Error('SELF_INSPECTION_ITEM_NOT_FOUND_OR_DELETED')
    const row = await prisma.selfInspectionTemplateBlockItem.findFirst({
      where: { id, ...notDeleted },
      select: itemSelect,
    })
    if (!row) throw new Error('SELF_INSPECTION_ITEM_NOT_FOUND_OR_DELETED')
    return row as SelfInspectionBlockItemRow
  },

  async delete(id: string, deletedById: string) {
    await prisma.selfInspectionTemplateBlockItem.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}
