import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'
import type { ConstructionValuationCreateInput } from '../../schemas/construction-valuation.js'

function parseDateOnly(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

export const constructionValuationRepository = {
  async listByProject(projectId: string, args: { skip: number; take: number }) {
    const where = { projectId, ...notDeleted }
    const [total, rows] = await Promise.all([
      prisma.constructionValuation.count({ where }),
      prisma.constructionValuation.findMany({
        where,
        orderBy: [{ valuationDate: 'desc' }, { createdAt: 'desc' }],
        skip: args.skip,
        take: args.take,
        include: {
          lines: {
            select: { currentPeriodQty: true, unitPrice: true },
          },
        },
      }),
    ])
    return { rows, total }
  },

  async findByIdForProject(projectId: string, valuationId: string) {
    return prisma.constructionValuation.findFirst({
      where: { id: valuationId, projectId, ...notDeleted },
      include: {
        lines: {
          orderBy: { sortOrder: 'asc' },
          include: {
            pccesItem: {
              select: {
                itemNo: true,
                importId: true,
                itemKey: true,
                parentItemKey: true,
                itemKind: true,
              },
            },
          },
        },
      },
    })
  },

  /**
   * 同專案、同 pccesItemId 之「其他估驗單」本次估驗數量加總（不含軟刪、不含指定估驗單）。
   */
  async sumCurrentPeriodQtyByPccesItemsExcludingValuation(
    projectId: string,
    pccesItemIds: string[],
    excludeValuationId?: string
  ): Promise<Map<string, Prisma.Decimal>> {
    const map = new Map<string, Prisma.Decimal>()
    for (const id of pccesItemIds) {
      map.set(id, new Prisma.Decimal(0))
    }
    if (pccesItemIds.length === 0) return map

    const groups = await prisma.constructionValuationLine.groupBy({
      by: ['pccesItemId'],
      where: {
        pccesItemId: { in: pccesItemIds },
        valuation: {
          projectId,
          ...notDeleted,
          ...(excludeValuationId ? { id: { not: excludeValuationId } } : {}),
        },
      },
      _sum: { currentPeriodQty: true },
    })
    for (const g of groups) {
      if (g.pccesItemId) {
        map.set(g.pccesItemId, g._sum.currentPeriodQty ?? new Prisma.Decimal(0))
      }
    }
    return map
  },

  async create(
    projectId: string,
    userId: string,
    body: ConstructionValuationCreateInput
  ): Promise<string> {
    const valuationDate = parseDateOnly(body.valuationDate ?? undefined)

    const created = await prisma.$transaction(async (tx) => {
      const v = await tx.constructionValuation.create({
        data: {
          projectId,
          createdById: userId,
          title: body.title ?? null,
          valuationDate,
          headerRemark: body.headerRemark,
        },
      })
      await tx.constructionValuationLine.createMany({
        data: body.lines.map((line, i) => ({
          valuationId: v.id,
          sortOrder: i,
          pccesItemId: line.pccesItemId ?? null,
          itemNo: line.itemNo,
          description: line.description,
          unit: line.unit,
          contractQty: line.contractQty,
          approvedQtyAfterChange: line.approvedQtyAfterChange,
          unitPrice: line.unitPrice,
          currentPeriodQty: line.currentPeriodQty,
          remark: line.remark,
        })),
      })
      return v
    })
    return created.id
  },

  async update(
    projectId: string,
    valuationId: string,
    body: ConstructionValuationCreateInput
  ): Promise<boolean> {
    const existing = await prisma.constructionValuation.findFirst({
      where: { id: valuationId, projectId, ...notDeleted },
      select: { id: true },
    })
    if (!existing) return false

    const valuationDate = parseDateOnly(body.valuationDate ?? undefined)

    await prisma.$transaction(async (tx) => {
      await tx.constructionValuationLine.deleteMany({ where: { valuationId } })
      await tx.constructionValuation.update({
        where: { id: valuationId },
        data: {
          title: body.title ?? null,
          valuationDate,
          headerRemark: body.headerRemark,
        },
      })
      await tx.constructionValuationLine.createMany({
        data: body.lines.map((line, i) => ({
          valuationId,
          sortOrder: i,
          pccesItemId: line.pccesItemId ?? null,
          itemNo: line.itemNo,
          description: line.description,
          unit: line.unit,
          contractQty: line.contractQty,
          approvedQtyAfterChange: line.approvedQtyAfterChange,
          unitPrice: line.unitPrice,
          currentPeriodQty: line.currentPeriodQty,
          remark: line.remark,
        })),
      })
    })
    return true
  },

  async softDelete(projectId: string, valuationId: string, deletedById: string): Promise<boolean> {
    const existing = await prisma.constructionValuation.findFirst({
      where: { id: valuationId, projectId, ...notDeleted },
      select: { id: true },
    })
    if (!existing) return false
    await prisma.constructionValuation.update({
      where: { id: valuationId },
      data: softDeleteSet(deletedById),
    })
    return true
  },
}
