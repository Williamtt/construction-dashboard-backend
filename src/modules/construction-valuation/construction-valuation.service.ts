import { Prisma } from '@prisma/client'
import { AppError } from '../../shared/errors.js'
import { assertProjectModuleAction } from '../project-permission/project-permission.service.js'
import { prisma } from '../../lib/db.js'
import { notDeleted } from '../../shared/soft-delete.js'
import type { ConstructionValuationCreateInput } from '../../schemas/construction-valuation.js'
import {
  constructionValuationCreateSchema,
  constructionValuationUpdateSchema,
} from '../../schemas/construction-valuation.js'
import { pccesImportRepository } from '../pcces-import/pcces-import.repository.js'
import { constructionValuationRepository } from './construction-valuation.repository.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

function formatDateOnlyUtc(d: Date | null): string | null {
  if (!d) return null
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function serializeDecimal(v: { toString(): string } | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return v.toString()
}

function decQty(s: string): Prisma.Decimal {
  try {
    return new Prisma.Decimal(s)
  } catch {
    return new Prisma.Decimal(0)
  }
}

function lineCap(
  contractQty: Prisma.Decimal,
  approvedQtyAfterChange: Prisma.Decimal | null
): Prisma.Decimal {
  if (approvedQtyAfterChange != null && !approvedQtyAfterChange.isNaN()) {
    return approvedQtyAfterChange
  }
  return contractQty
}

function serializeLineComputed(params: {
  priorBilledQty: Prisma.Decimal
  contractQty: Prisma.Decimal
  approvedQtyAfterChange: Prisma.Decimal | null
  unitPrice: Prisma.Decimal
  currentPeriodQty: Prisma.Decimal
  itemNo: string
  description: string
  unit: string
  remark: string
  pccesItemId: string | null
  lineId: string
}) {
  const cap = lineCap(params.contractQty, params.approvedQtyAfterChange)
  const current = params.currentPeriodQty
  const prior = params.priorBilledQty
  const cumulative = prior.plus(current)
  const available = cap.minus(prior).minus(current)
  const availStr = available.isNeg() ? '0' : available.toString()
  return {
    id: params.lineId,
    pccesItemId: params.pccesItemId,
    itemNo: params.itemNo,
    description: params.description,
    unit: params.unit,
    contractQty: params.contractQty.toString(),
    approvedQtyAfterChange: serializeDecimal(params.approvedQtyAfterChange),
    unitPrice: params.unitPrice.toString(),
    currentPeriodQty: current.toString(),
    remark: params.remark,
    priorBilledQty: prior.toString(),
    maxQty: cap.toString(),
    /** 本次可估驗數量（剩餘可再填之空間；與本次估驗數量連動） */
    availableValuationQty: availStr,
    cumulativeValuationQtyToDate: cumulative.toString(),
    currentPeriodAmount: current.mul(params.unitPrice).toString(),
    cumulativeAmountToDate: cumulative.mul(params.unitPrice).toString(),
  }
}

type ValuationLineRow = NonNullable<
  Awaited<ReturnType<typeof constructionValuationRepository.findByIdForProject>>
>['lines'][0]

type SerializedValuationLine = ReturnType<typeof serializeLineComputed> & {
  pccesParentItemKey: number | null
}

function serializeLineWithParentKey(
  l: ValuationLineRow,
  prior: Prisma.Decimal
): SerializedValuationLine {
  const base = serializeLineComputed({
    lineId: l.id,
    pccesItemId: l.pccesItemId,
    itemNo: l.pccesItem?.itemNo ?? l.itemNo,
    description: l.description,
    unit: l.unit,
    contractQty: l.contractQty,
    approvedQtyAfterChange: l.approvedQtyAfterChange,
    unitPrice: l.unitPrice,
    currentPeriodQty: l.currentPeriodQty,
    remark: l.remark,
    priorBilledQty: prior,
  })
  return {
    ...base,
    pccesParentItemKey: l.pccesItem?.parentItemKey ?? null,
  }
}

async function buildOrderedLinesAndGroups(
  row: NonNullable<Awaited<ReturnType<typeof constructionValuationRepository.findByIdForProject>>>,
  priorByPccesId: Map<string, Prisma.Decimal>
): Promise<{
  lines: SerializedValuationLine[]
  lineGroups: {
    parent: {
      itemNo: string
      description: string
      unit: string
      currentPeriodAmountSum: string
      cumulativeAmountToDateSum: string
    } | null
    lineStartIndex: number
    lineCount: number
  }[]
}> {
  type Entry = { sortOrder: number; serialized: SerializedValuationLine; raw: ValuationLineRow }

  const entries: Entry[] = row.lines.map((l) => {
    const prior =
      l.pccesItemId != null
        ? (priorByPccesId.get(l.pccesItemId) ?? new Prisma.Decimal(0))
        : new Prisma.Decimal(0)
    return {
      sortOrder: l.sortOrder,
      serialized: serializeLineWithParentKey(l, prior),
      raw: l,
    }
  })

  const manual = entries.filter((e) => !e.raw.pccesItemId).sort((a, b) => a.sortOrder - b.sortOrder)
  const pcces = entries.filter((e) => e.raw.pccesItemId)

  if (pcces.length === 0) {
    const lines = manual.map((e) => e.serialized)
    const lineGroups =
      manual.length > 0 ? [{ parent: null as null, lineStartIndex: 0, lineCount: manual.length }] : []
    return { lines, lineGroups }
  }

  const importIds = new Set(
    pcces.map((e) => e.raw.pccesItem!.importId).filter((id): id is string => Boolean(id))
  )
  if (importIds.size !== 1) {
    const all = [...entries].sort((a, b) => a.sortOrder - b.sortOrder)
    const lines = all.map((e) => e.serialized)
    return {
      lines,
      lineGroups: [{ parent: null, lineStartIndex: 0, lineCount: lines.length }],
    }
  }

  const importId = [...importIds][0]!
  const allItems = await prisma.pccesItem.findMany({
    where: { importId, ...notDeleted },
    select: {
      itemKey: true,
      itemKind: true,
      itemNo: true,
      description: true,
      unit: true,
    },
  })
  const byKey = new Map(allItems.map((i) => [i.itemKey, i]))

  const parentBuckets = new Map<number, Entry[]>()
  const orphanPcces: Entry[] = []

  for (const e of pcces) {
    const pk = e.raw.pccesItem?.parentItemKey
    if (pk != null) {
      const parent = byKey.get(pk)
      if (parent?.itemKind === 'mainItem') {
        const list = parentBuckets.get(pk) ?? []
        list.push(e)
        parentBuckets.set(pk, list)
        continue
      }
    }
    orphanPcces.push(e)
  }

  const sortedPks = [...parentBuckets.keys()].sort((a, b) => a - b)
  orphanPcces.sort((a, b) => a.sortOrder - b.sortOrder)

  const ordered: SerializedValuationLine[] = []
  const lineGroups: {
    parent: {
      itemNo: string
      description: string
      unit: string
      currentPeriodAmountSum: string
      cumulativeAmountToDateSum: string
    } | null
    lineStartIndex: number
    lineCount: number
  }[] = []

  for (const pk of sortedPks) {
    const arr = (parentBuckets.get(pk) ?? []).sort((a, b) => a.sortOrder - b.sortOrder)
    if (arr.length === 0) continue
    const parentRow = byKey.get(pk)
    if (!parentRow) continue
    const start = ordered.length
    let sum6 = new Prisma.Decimal(0)
    let sum7 = new Prisma.Decimal(0)
    for (const e of arr) {
      ordered.push(e.serialized)
      sum6 = sum6.plus(decQty(e.serialized.currentPeriodAmount))
      sum7 = sum7.plus(decQty(e.serialized.cumulativeAmountToDate))
    }
    lineGroups.push({
      parent: {
        itemNo: parentRow.itemNo,
        description: parentRow.description,
        unit: parentRow.unit,
        currentPeriodAmountSum: sum6.toString(),
        cumulativeAmountToDateSum: sum7.toString(),
      },
      lineStartIndex: start,
      lineCount: arr.length,
    })
  }

  if (orphanPcces.length > 0) {
    const start = ordered.length
    for (const e of orphanPcces) {
      ordered.push(e.serialized)
    }
    lineGroups.push({
      parent: null,
      lineStartIndex: start,
      lineCount: orphanPcces.length,
    })
  }

  if (manual.length > 0) {
    const start = ordered.length
    for (const e of manual) {
      ordered.push(e.serialized)
    }
    lineGroups.push({
      parent: null,
      lineStartIndex: start,
      lineCount: manual.length,
    })
  }

  return { lines: ordered, lineGroups }
}

async function normalizeValuationBody(
  projectId: string,
  excludeValuationId: string | undefined,
  body: ConstructionValuationCreateInput
): Promise<ConstructionValuationCreateInput> {
  const seen = new Set<string>()
  for (const line of body.lines) {
    if (line.pccesItemId) {
      if (seen.has(line.pccesItemId)) {
        throw new AppError(400, 'VALIDATION_ERROR', '同一估驗單不可重複綁定相同 PCCES 工項')
      }
      seen.add(line.pccesItemId)
    }
  }

  const pccesIds = body.lines
    .map((l) => l.pccesItemId)
    .filter((id): id is string => Boolean(id))

  const latest = await pccesImportRepository.findLatestApprovedImport(projectId)

  let priorMap = new Map<string, Prisma.Decimal>()
  if (pccesIds.length > 0) {
    if (!latest) {
      throw new AppError(400, 'PCCES_NOT_APPROVED', '專案尚無核定之 PCCES 版本，無法綁定工項')
    }
    priorMap = await constructionValuationRepository.sumCurrentPeriodQtyByPccesItemsExcludingValuation(
      projectId,
      pccesIds,
      excludeValuationId
    )
  }

  const items =
    pccesIds.length === 0
      ? []
      : await prisma.pccesItem.findMany({
          where: {
            id: { in: pccesIds },
            importId: latest!.id,
            itemKind: 'general',
            ...notDeleted,
          },
        })
  const itemById = new Map(items.map((i) => [i.id, i]))

  const nextLines: ConstructionValuationCreateInput['lines'] = []

  for (const line of body.lines) {
    const current = decQty(line.currentPeriodQty)
    if (current.isNeg()) {
      throw new AppError(400, 'VALIDATION_ERROR', '本次估驗數量不可為負')
    }

    if (!line.pccesItemId) {
      const contract = decQty(line.contractQty)
      const cap = lineCap(contract, line.approvedQtyAfterChange ? decQty(line.approvedQtyAfterChange) : null)
      if (current.gt(cap)) {
        throw new AppError(400, 'VALUATION_QTY_EXCEEDED', '本次估驗數量不可超過契約／變更後核定上限')
      }
      nextLines.push({
        ...line,
        pccesItemId: undefined,
        contractQty: contract.toString(),
        approvedQtyAfterChange: line.approvedQtyAfterChange,
        unitPrice: decQty(line.unitPrice).toString(),
        currentPeriodQty: current.toString(),
      })
      continue
    }

    const item = itemById.get(line.pccesItemId)
    if (!item) {
      throw new AppError(400, 'BAD_REQUEST', 'PCCES 工項無效或不在目前核定版本中')
    }

    const contract = item.quantity
    const approvedSnap = line.approvedQtyAfterChange ? decQty(line.approvedQtyAfterChange) : null
    const cap = lineCap(contract, approvedSnap)
    const prior = priorMap.get(line.pccesItemId) ?? new Prisma.Decimal(0)
    if (prior.plus(current).gt(cap)) {
      throw new AppError(
        400,
        'VALUATION_QTY_EXCEEDED',
        '本次估驗後累計不可超過契約／變更後核定數量'
      )
    }

    nextLines.push({
      pccesItemId: item.id,
      itemNo: item.itemNo,
      description: item.description,
      unit: item.unit,
      contractQty: contract.toString(),
      approvedQtyAfterChange: approvedSnap ? approvedSnap.toString() : null,
      unitPrice: item.unitPrice.toString(),
      currentPeriodQty: current.toString(),
      remark: line.remark,
    })
  }

  return { ...body, lines: nextLines }
}

function serializeListRow(
  row: Awaited<ReturnType<typeof constructionValuationRepository.listByProject>>['rows'][0]
) {
  let total = new Prisma.Decimal(0)
  for (const l of row.lines) {
    total = total.plus(l.currentPeriodQty.mul(l.unitPrice))
  }
  return {
    id: row.id,
    title: row.title,
    valuationDate: formatDateOnlyUtc(row.valuationDate),
    headerRemark: row.headerRemark,
    currentPeriodTotalAmount: total.toString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

async function serializeDetail(
  row: NonNullable<Awaited<ReturnType<typeof constructionValuationRepository.findByIdForProject>>>,
  priorByPccesId: Map<string, Prisma.Decimal>
) {
  const { lines, lineGroups } = await buildOrderedLinesAndGroups(row, priorByPccesId)
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    valuationDate: formatDateOnlyUtc(row.valuationDate),
    headerRemark: row.headerRemark,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines,
    lineGroups,
  }
}

async function loadValuationDetail(projectId: string, valuationId: string, user: AuthUser) {
  await assertProjectModuleAction(user, projectId, 'construction.valuation', 'read')
  const row = await constructionValuationRepository.findByIdForProject(projectId, valuationId)
  if (!row) throw new AppError(404, 'NOT_FOUND', '找不到估驗計價')
  const pccesIds = row.lines.map((l) => l.pccesItemId).filter((id): id is string => Boolean(id))
  const priorMap =
    pccesIds.length === 0
      ? new Map<string, Prisma.Decimal>()
      : await constructionValuationRepository.sumCurrentPeriodQtyByPccesItemsExcludingValuation(
          projectId,
          pccesIds,
          valuationId
        )
  return await serializeDetail(row, priorMap)
}

export const constructionValuationService = {
  async list(projectId: string, user: AuthUser, page: number, limit: number) {
    await assertProjectModuleAction(user, projectId, 'construction.valuation', 'read')
    const skip = (page - 1) * limit
    const { rows, total } = await constructionValuationRepository.listByProject(projectId, {
      skip,
      take: limit,
    })
    return {
      data: rows.map(serializeListRow),
      meta: { page, limit, total },
    }
  },

  async getById(projectId: string, valuationId: string, user: AuthUser) {
    return loadValuationDetail(projectId, valuationId, user)
  },

  async create(projectId: string, user: AuthUser, raw: unknown) {
    await assertProjectModuleAction(user, projectId, 'construction.valuation', 'create')
    const parsed = constructionValuationCreateSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', '資料驗證失敗')
    }
    const normalized = await normalizeValuationBody(projectId, undefined, parsed.data)
    const id = await constructionValuationRepository.create(projectId, user.id, normalized)
    return loadValuationDetail(projectId, id, user)
  },

  async update(projectId: string, valuationId: string, user: AuthUser, raw: unknown) {
    await assertProjectModuleAction(user, projectId, 'construction.valuation', 'update')
    const parsed = constructionValuationUpdateSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', '資料驗證失敗')
    }
    const normalized = await normalizeValuationBody(projectId, valuationId, parsed.data)
    const ok = await constructionValuationRepository.update(projectId, valuationId, normalized)
    if (!ok) throw new AppError(404, 'NOT_FOUND', '找不到估驗計價')
    return loadValuationDetail(projectId, valuationId, user)
  },

  async delete(projectId: string, valuationId: string, user: AuthUser) {
    await assertProjectModuleAction(user, projectId, 'construction.valuation', 'delete')
    const ok = await constructionValuationRepository.softDelete(projectId, valuationId, user.id)
    if (!ok) throw new AppError(404, 'NOT_FOUND', '找不到估驗計價')
    return { ok: true as const }
  },

  /**
   * 估驗計價用：最新核定版 PCCES general 工項（與施工日誌相同分組），
   * 並帶出他次估驗已請款數量與剩餘可估驗空間（尚未扣本次手填）。
   */
  async getPccesLinePicker(projectId: string, user: AuthUser, excludeValuationId?: string) {
    await assertProjectModuleAction(user, projectId, 'construction.valuation', 'read')
    const latest = await pccesImportRepository.findLatestApprovedImport(projectId)
    type ChildOut = {
      pccesItemId: string
      itemNo: string
      description: string
      unit: string
      contractQty: string
      approvedQtyAfterChange: string | null
      unitPrice: string
      priorBilledQty: string
      maxQty: string
      suggestedAvailableQty: string
    }
    type GroupOut = {
      parent: { itemNo: string; description: string; unit: string; itemKey: number } | null
      children: ChildOut[]
    }
    if (!latest) {
      return {
        pccesImport: null as null,
        groups: [] as GroupOut[],
        items: [] as ChildOut[],
      }
    }

    const allItems = await prisma.pccesItem.findMany({
      where: { importId: latest.id, ...notDeleted },
      orderBy: { itemKey: 'asc' },
      select: {
        id: true,
        itemKey: true,
        parentItemKey: true,
        itemKind: true,
        itemNo: true,
        description: true,
        unit: true,
        quantity: true,
        unitPrice: true,
      },
    })
    const byItemKey = new Map(allItems.map((i) => [i.itemKey, i]))
    const generals = allItems.filter((i) => i.itemKind === 'general')

    const childrenByParentKey = new Map<number, typeof generals>()
    const orphans: typeof generals = []
    for (const g of generals) {
      const pk = g.parentItemKey
      if (pk == null) {
        orphans.push(g)
        continue
      }
      const parentRow = byItemKey.get(pk)
      if (!parentRow || parentRow.itemKind !== 'mainItem') {
        orphans.push(g)
        continue
      }
      const list = childrenByParentKey.get(pk) ?? []
      list.push(g)
      childrenByParentKey.set(pk, list)
    }

    const allChildIds: string[] = []
    const groups: GroupOut[] = []
    const sortedParentKeys = [...childrenByParentKey.keys()].sort((a, b) => a - b)
    for (const pk of sortedParentKeys) {
      const kids = childrenByParentKey.get(pk)
      if (!kids?.length) continue
      kids.sort((a, b) => a.itemKey - b.itemKey)
      const parentRow = byItemKey.get(pk)
      if (!parentRow) continue
      allChildIds.push(...kids.map((k) => k.id))
      groups.push({
        parent: {
          itemNo: parentRow.itemNo,
          description: parentRow.description,
          unit: parentRow.unit,
          itemKey: parentRow.itemKey,
        },
        children: kids.map((r) => ({
          pccesItemId: r.id,
          itemNo: r.itemNo,
          description: r.description,
          unit: r.unit,
          contractQty: r.quantity.toString(),
          approvedQtyAfterChange: null as string | null,
          unitPrice: r.unitPrice.toString(),
          priorBilledQty: '0',
          maxQty: r.quantity.toString(),
          suggestedAvailableQty: r.quantity.toString(),
        })),
      })
    }
    if (orphans.length > 0) {
      orphans.sort((a, b) => a.itemKey - b.itemKey)
      allChildIds.push(...orphans.map((o) => o.id))
      groups.push({
        parent: null,
        children: orphans.map((r) => ({
          pccesItemId: r.id,
          itemNo: r.itemNo,
          description: r.description,
          unit: r.unit,
          contractQty: r.quantity.toString(),
          approvedQtyAfterChange: null as string | null,
          unitPrice: r.unitPrice.toString(),
          priorBilledQty: '0',
          maxQty: r.quantity.toString(),
          suggestedAvailableQty: r.quantity.toString(),
        })),
      })
    }

    const priorMap =
      allChildIds.length === 0
        ? new Map<string, Prisma.Decimal>()
        : await constructionValuationRepository.sumCurrentPeriodQtyByPccesItemsExcludingValuation(
            projectId,
            allChildIds,
            excludeValuationId
          )

    for (const g of groups) {
      for (const c of g.children) {
        const prior = priorMap.get(c.pccesItemId) ?? new Prisma.Decimal(0)
        const cap = decQty(c.maxQty)
        const avail = cap.minus(prior)
        c.priorBilledQty = prior.toString()
        c.suggestedAvailableQty = (avail.isNeg() ? new Prisma.Decimal(0) : avail).toString()
      }
    }

    const items: ChildOut[] = groups.flatMap((g) => g.children)
    const parentRow = await pccesImportRepository.findByIdForProject(projectId, latest.id)
    return {
      pccesImport: parentRow
        ? {
            id: parentRow.id,
            version: parentRow.version,
            approvedAt: parentRow.approvedAt?.toISOString() ?? null,
            approvedById: parentRow.approvedById,
          }
        : {
            id: latest.id,
            version: latest.version,
            approvedAt: null as string | null,
            approvedById: null as string | null,
          },
      groups,
      items,
    }
  },
}
