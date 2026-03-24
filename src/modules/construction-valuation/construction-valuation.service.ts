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
import {
  comparePccesDisplayPathOrder,
  orderPccesValuationBucketEmits,
  sortPccesRowsByDisplayPath,
} from '../pcces-import/pcces-path-sort.js'
import {
  allowsUserEnteredQtyForPccesItemKind,
  isStructuralLeaf,
  parentItemKeysWithChildren,
} from '../pcces-import/pcces-item-tree.js'
import { constructionDailyLogRepository } from '../construction-daily-log/construction-daily-log.repository.js'
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

/** 估驗「截至」日：有表頭日期用該日（UTC 日界）；否則用今天 UTC。 */
function asOfDateUtcForValuation(valuationDateIso: string | null | undefined): Date {
  const t = valuationDateIso?.trim()
  if (t) {
    const [y, m, d] = t.split('-').map(Number)
    if (y && m && d) return new Date(Date.UTC(y, m - 1, d))
  }
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/**
 * 與施工日誌選版一致：以 UTC 日曆日比對 `approvalEffectiveAt`／`approvedAt`；
 * 日期字串用正午 UTC 避免日界偏移。
 */
function pickerDateForPccesEffective(asOfDateIso?: string | null): Date {
  const t = asOfDateIso?.trim()
  if (t && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const d = new Date(`${t}T12:00:00.000Z`)
    if (!Number.isNaN(d.getTime())) return d
  }
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0, 0))
}

function serializeDecimal(v: { toString(): string } | null | undefined): string | null {
  if (v === null || v === undefined) return null
  return v.toString()
}

function manualValuationLinePath(itemNo: string, description: string): string {
  return `${itemNo.trim()} ${description.trim()}`.trim()
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
  /** 他次估驗已請款金額加總（依 itemKey 跨版 Σ 歷史列 qty×單價）；手填列為 0 */
  priorBilledAmount: Prisma.Decimal
  contractQty: Prisma.Decimal
  approvedQtyAfterChange: Prisma.Decimal | null
  unitPrice: Prisma.Decimal
  currentPeriodQty: Prisma.Decimal
  itemNo: string
  description: string
  unit: string
  remark: string
  pccesItemId: string | null
  /** 綁定 PCCES 時之 XML itemKind；手填列為 null */
  pccesItemKind: string | null
  lineId: string
  /** PCCES 列：施工日誌截至估驗日之累計完成量；手填列為 null（不限制） */
  logAccumulatedQtyToDate: Prisma.Decimal | null
  /** 契約階層 path 快照（與 PccesItem.path）；手填為單段 */
  path: string
}) {
  const cap = lineCap(params.contractQty, params.approvedQtyAfterChange)
  const current = params.currentPeriodQty
  const prior = params.priorBilledQty
  const cumulative = prior.plus(current)
  const effectiveCap =
    params.pccesItemId != null && params.logAccumulatedQtyToDate != null
      ? Prisma.Decimal.min(cap, params.logAccumulatedQtyToDate)
      : cap
  const available = effectiveCap.minus(prior).minus(current)
  const availStr = available.isNeg() ? '0' : available.toString()
  return {
    id: params.lineId,
    pccesItemId: params.pccesItemId,
    pccesItemKind: params.pccesItemKind,
    itemNo: params.itemNo,
    description: params.description,
    unit: params.unit,
    contractQty: params.contractQty.toString(),
    approvedQtyAfterChange: serializeDecimal(params.approvedQtyAfterChange),
    unitPrice: params.unitPrice.toString(),
    currentPeriodQty: current.toString(),
    remark: params.remark,
    priorBilledQty: prior.toString(),
    priorBilledAmount: params.priorBilledAmount.toString(),
    maxQty: cap.toString(),
    logAccumulatedQtyToDate:
      params.pccesItemId != null && params.logAccumulatedQtyToDate != null
        ? params.logAccumulatedQtyToDate.toString()
        : null,
    /** 本次可估驗數量：min(契約上限,日誌累計)−已請款−本次填寫；與本次估驗數量連動 */
    availableValuationQty: availStr,
    cumulativeValuationQtyToDate: cumulative.toString(),
    currentPeriodAmount: current.mul(params.unitPrice).toString(),
    /** （七）＝歷史請款金額快照加總＋本期（本次數量×本列單價），不用「累計數量×當前單價」以免換版單價改寫前期金額 */
    cumulativeAmountToDate: params.priorBilledAmount.plus(current.mul(params.unitPrice)).toString(),
    path: params.path,
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
  prior: Prisma.Decimal,
  priorAmount: Prisma.Decimal,
  logByPccesId: Map<string, Prisma.Decimal>
): SerializedValuationLine {
  const logQty =
    l.pccesItemId != null ? (logByPccesId.get(l.pccesItemId) ?? new Prisma.Decimal(0)) : null
  const base = serializeLineComputed({
    lineId: l.id,
    pccesItemId: l.pccesItemId,
    pccesItemKind: l.pccesItem?.itemKind ?? null,
    itemNo: l.pccesItem?.itemNo ?? l.itemNo,
    description: l.description,
    unit: l.unit,
    contractQty: l.contractQty,
    approvedQtyAfterChange: l.approvedQtyAfterChange,
    unitPrice: l.unitPrice,
    currentPeriodQty: l.currentPeriodQty,
    remark: l.remark,
    priorBilledQty: prior,
    priorBilledAmount: priorAmount,
    logAccumulatedQtyToDate: logQty,
    path: l.path ?? '',
  })
  return {
    ...base,
    pccesParentItemKey: l.pccesItem?.parentItemKey ?? null,
  }
}

async function buildOrderedLinesAndGroups(
  row: NonNullable<Awaited<ReturnType<typeof constructionValuationRepository.findByIdForProject>>>,
  priorByPccesId: Map<string, Prisma.Decimal>,
  priorAmountByPccesId: Map<string, Prisma.Decimal>,
  logByPccesId: Map<string, Prisma.Decimal>
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

  function effectiveValuationLinePath(line: ValuationLineRow, idToPathFallback: Map<string, string>): string {
    const p = line.path?.trim()
    if (p) return p
    if (line.pccesItemId) {
      const fb = idToPathFallback.get(line.pccesItemId)?.trim()
      if (fb) return fb
    }
    return manualValuationLinePath(line.itemNo, line.description)
  }

  const entries: Entry[] = row.lines.map((l) => {
    const prior =
      l.pccesItemId != null
        ? (priorByPccesId.get(l.pccesItemId) ?? new Prisma.Decimal(0))
        : new Prisma.Decimal(0)
    const priorAmt =
      l.pccesItemId != null
        ? (priorAmountByPccesId.get(l.pccesItemId) ?? new Prisma.Decimal(0))
        : new Prisma.Decimal(0)
    return {
      sortOrder: l.sortOrder,
      serialized: serializeLineWithParentKey(l, prior, priorAmt, logByPccesId),
      raw: l,
    }
  })

  const idToPathFallback = new Map<string, string>()
  const pccesIdsForPath = entries
    .map((e) => e.raw.pccesItemId)
    .filter((id): id is string => Boolean(id))
  if (pccesIdsForPath.length > 0) {
    const pr = await prisma.pccesItem.findMany({
      where: { id: { in: pccesIdsForPath }, ...notDeleted },
      select: { id: true, path: true },
    })
    for (const r of pr) idToPathFallback.set(r.id, r.path)
  }

  const sortByStoredPath = (a: Entry, b: Entry) => {
    const c = comparePccesDisplayPathOrder(
      effectiveValuationLinePath(a.raw, idToPathFallback),
      effectiveValuationLinePath(b.raw, idToPathFallback)
    )
    return c !== 0 ? c : a.sortOrder - b.sortOrder
  }

  const manual = entries.filter((e) => !e.raw.pccesItemId).sort(sortByStoredPath)
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
    const all = [...entries].sort(sortByStoredPath)
    const lines = all.map((e) => e.serialized)
    return {
      lines,
      lineGroups: [{ parent: null, lineStartIndex: 0, lineCount: lines.length }],
    }
  }

  const importId = [...importIds][0]!
  const allItemsRaw = await prisma.pccesItem.findMany({
    where: { importId, ...notDeleted },
    select: {
      itemKey: true,
      parentItemKey: true,
      itemKind: true,
      itemNo: true,
      description: true,
      unit: true,
      path: true,
    },
  })
  const allItems = sortPccesRowsByDisplayPath(allItemsRaw)
  const byKey = new Map(allItems.map((i) => [i.itemKey, i]))

  const parentBuckets = new Map<number, Entry[]>()
  const orphanPcces: Entry[] = []

  for (const e of pcces) {
    const pk = e.raw.pccesItem?.parentItemKey
    if (pk != null) {
      const parent = byKey.get(pk)
      if (parent != null) {
        const list = parentBuckets.get(pk) ?? []
        list.push(e)
        parentBuckets.set(pk, list)
        continue
      }
    }
    orphanPcces.push(e)
  }

  const bucketEmits = orderPccesValuationBucketEmits(
    parentBuckets.keys(),
    allItems.map((i) => ({
      itemKey: i.itemKey,
      parentItemKey: i.parentItemKey,
      path: i.path,
    })),
  )
  orphanPcces.sort(sortByStoredPath)

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
    showParentRow?: boolean
  }[] = []

  for (const em of bucketEmits) {
    if (em.kind === 'chapterBanner') {
      const parentRow = byKey.get(em.parentItemKey)
      if (!parentRow) continue
      lineGroups.push({
        parent: {
          itemNo: parentRow.itemNo,
          description: parentRow.description,
          unit: parentRow.unit,
          currentPeriodAmountSum: '0',
          cumulativeAmountToDateSum: '0',
        },
        lineStartIndex: ordered.length,
        lineCount: 0,
        showParentRow: true,
      })
      continue
    }
    const pk = em.parentItemKey
    const arr = (parentBuckets.get(pk) ?? []).sort(sortByStoredPath)
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
      showParentRow: !em.hideParentRow,
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
  body: ConstructionValuationCreateInput,
  /** 更新時：已存在之 PCCES 列 `pccesItemId` → 存檔單價；送出的單價須與之一致（Decimal 相等） */
  lockPccesUnitPriceByPccesItemId?: Map<string, Prisma.Decimal>
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
  let logAccumMap = new Map<string, Prisma.Decimal>()
  if (pccesIds.length > 0) {
    if (!latest) {
      throw new AppError(400, 'PCCES_NOT_APPROVED', '專案尚無核定之 PCCES 版本，無法綁定工項')
    }
    priorMap = await constructionValuationRepository.sumCurrentPeriodQtyByPccesItemsExcludingValuation(
      projectId,
      pccesIds,
      excludeValuationId
    )
    const asOf = asOfDateUtcForValuation(body.valuationDate ?? null)
    logAccumMap = await constructionDailyLogRepository.sumDailyQtyByPccesItemsThroughDateInclusive(
      projectId,
      pccesIds,
      asOf
    )
  }

  const treeShape =
    pccesIds.length === 0
      ? []
      : await prisma.pccesItem.findMany({
          where: { importId: latest!.id, ...notDeleted },
          select: { itemKey: true, parentItemKey: true },
        })
  const parentsWithChildren = parentItemKeysWithChildren(treeShape)

  const items =
    pccesIds.length === 0
      ? []
      : await prisma.pccesItem.findMany({
          where: {
            id: { in: pccesIds },
            importId: latest!.id,
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
        path: manualValuationLinePath(line.itemNo, line.description),
        contractQty: contract.toString(),
        approvedQtyAfterChange: line.approvedQtyAfterChange,
        unitPrice: decQty(line.unitPrice).toString(),
        currentPeriodQty: current.toString(),
      })
      continue
    }

    const item = itemById.get(line.pccesItemId)
    if (!item || !isStructuralLeaf(item, parentsWithChildren)) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'PCCES 工項無效、非末層或不在目前核定版本中'
      )
    }

    if (!allowsUserEnteredQtyForPccesItemKind(item.itemKind) && !current.isZero()) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        '此 PCCES 類型僅能填寫本次估驗數量為 0'
      )
    }

    const lockedUnitPrice = lockPccesUnitPriceByPccesItemId?.get(line.pccesItemId)
    if (lockedUnitPrice !== undefined) {
      const submittedPrice = decQty(line.unitPrice)
      if (!submittedPrice.equals(lockedUnitPrice)) {
        throw new AppError(
          400,
          'VALUATION_UNIT_PRICE_IMMUTABLE',
          '此估驗單已存檔之 PCCES 明細單價不可變更，以免已請款紀錄與歷史口徑被改寫。若需更正請聯繫管理員。'
        )
      }
    }

    /** 契約／單價／項次說明等一律採請求快照（對齊估驗當下或畫面所見），勿覆寫為最新核定版 */
    const contract = decQty(line.contractQty)
    const approvedSnap = line.approvedQtyAfterChange ? decQty(line.approvedQtyAfterChange) : null
    const cap = lineCap(contract, approvedSnap)
    const prior = priorMap.get(line.pccesItemId) ?? new Prisma.Decimal(0)
    const logQty = logAccumMap.get(line.pccesItemId) ?? new Prisma.Decimal(0)
    const effectiveCap = Prisma.Decimal.min(cap, logQty)
    if (prior.plus(current).gt(effectiveCap)) {
      throw new AppError(
        400,
        'VALUATION_QTY_EXCEEDED',
        '本次估驗後累計不可超過施工日誌累計完成量（並受契約／變更後核定上限）'
      )
    }

    const pathSnap = line.path?.trim() ? line.path.trim() : item.path
    const itemNoSnap = line.itemNo?.trim() ? line.itemNo.trim() : item.itemNo

    nextLines.push({
      pccesItemId: item.id,
      itemNo: itemNoSnap,
      description: line.description,
      unit: line.unit,
      contractQty: contract.toString(),
      approvedQtyAfterChange: approvedSnap ? approvedSnap.toString() : null,
      unitPrice: decQty(line.unitPrice).toString(),
      currentPeriodQty: current.toString(),
      remark: line.remark,
      path: pathSnap,
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
  priorByPccesId: Map<string, Prisma.Decimal>,
  priorAmountByPccesId: Map<string, Prisma.Decimal>,
  logByPccesId: Map<string, Prisma.Decimal>
) {
  const { lines, lineGroups } = await buildOrderedLinesAndGroups(
    row,
    priorByPccesId,
    priorAmountByPccesId,
    logByPccesId
  )
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
  const asOf = asOfDateUtcForValuation(formatDateOnlyUtc(row.valuationDate))
  const [priorMap, priorAmountMap, logMap] =
    pccesIds.length === 0
      ? [
          new Map<string, Prisma.Decimal>(),
          new Map<string, Prisma.Decimal>(),
          new Map<string, Prisma.Decimal>(),
        ]
      : await Promise.all([
          constructionValuationRepository.sumCurrentPeriodQtyByPccesItemsExcludingValuation(
            projectId,
            pccesIds,
            valuationId
          ),
          constructionValuationRepository.sumCurrentPeriodAmountByPccesItemsExcludingValuation(
            projectId,
            pccesIds,
            valuationId
          ),
          constructionDailyLogRepository.sumDailyQtyByPccesItemsThroughDateInclusive(
            projectId,
            pccesIds,
            asOf
          ),
        ])
  return await serializeDetail(row, priorMap, priorAmountMap, logMap)
}

export const constructionValuationService = {
  /**
   * 估驗列表頁 KPI（與產品定義對齊）：
   * - **已請款金額**：全專案所有估驗單各期「本次估驗金額」（明細 currentPeriodQty×unitPrice）加總。
   * - **契約／變更後可計價上限總額**：最新核定 PCCES 之**結構末層** Σ(契約數量×單價)；數量以當日有效版覆寫（與 pcces-lines 選取邏輯一致）。
   * - **施作可計價金額（供尚未請款）**：同上末層 Σ(min(契約數量, 施工日誌截至今日累計)×單價)。不含純手填估驗列。
   * - **尚未請款金額**：max(0, 施作可計價 − 已請款)；若純手填已請款大於 PCCES 施作面，則顯示 0。
   * - **請款進度**：已請款 ÷ 契約上限（>100% 時截斷為 100）；無核定 PCCES 或上限為 0 時為 null。
   */
  async getListSummary(projectId: string, user: AuthUser) {
    await assertProjectModuleAction(user, projectId, 'construction.valuation', 'read')
    const billedTotal =
      await constructionValuationRepository.sumAllCurrentPeriodAmountsByProject(projectId)
    const picker = await constructionValuationService.getPccesLinePicker(
      projectId,
      user,
      undefined,
      undefined
    )

    let contractCapTotal = new Prisma.Decimal(0)
    let workDoneAtPriceTotal = new Prisma.Decimal(0)
    for (const row of picker.items) {
      const cap = new Prisma.Decimal(row.maxQty ?? row.contractQty)
      const log = new Prisma.Decimal(row.logAccumulatedQtyToDate ?? 0)
      const price = new Prisma.Decimal(row.unitPrice)
      contractCapTotal = contractCapTotal.plus(cap.mul(price))
      const qtyForWork = Prisma.Decimal.min(cap, log)
      workDoneAtPriceTotal = workDoneAtPriceTotal.plus(qtyForWork.mul(price))
    }

    const unbilledRaw = workDoneAtPriceTotal.minus(billedTotal)
    const unbilledAmount = unbilledRaw.isNeg() ? new Prisma.Decimal(0) : unbilledRaw

    let billingProgress: number | null = null
    if (contractCapTotal.gt(0)) {
      const ratio = billedTotal.div(contractCapTotal).toNumber()
      billingProgress = Math.min(100, Math.max(0, Math.round(ratio * 1000) / 10))
    }

    return {
      contractBillableCapTotal: contractCapTotal.toString(),
      billedAmountTotal: billedTotal.toString(),
      workDoneAtPriceTotal: workDoneAtPriceTotal.toString(),
      unbilledAmount: unbilledAmount.toString(),
      billingProgress,
    }
  },

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
    const existing = await constructionValuationRepository.findByIdForProject(projectId, valuationId)
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', '找不到估驗計價')
    }
    const lockPccesUnitPriceByPccesItemId = new Map<string, Prisma.Decimal>()
    for (const l of existing.lines) {
      if (l.pccesItemId) {
        lockPccesUnitPriceByPccesItemId.set(l.pccesItemId, l.unitPrice)
      }
    }
    const normalized = await normalizeValuationBody(
      projectId,
      valuationId,
      parsed.data,
      lockPccesUnitPriceByPccesItemId
    )
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
   * 估驗計價用：**結構與 pccesItemId 為最新核定版**；契約欄位（項次／說明／數量／單價等）依
   * **估驗日（asOfDate）當日或之前已生效之核定版**覆寫（與施工日誌選版相同）；列順序依 path 解析序。
   */
  async getPccesLinePicker(
    projectId: string,
    user: AuthUser,
    excludeValuationId?: string,
    /** YYYY-MM-DD；決定生效 PCCES 版次（與施工日誌）；施工日誌累計算至該日（含）；省略則今日 UTC 正午 */
    asOfDateIso?: string | null
  ) {
    await assertProjectModuleAction(user, projectId, 'construction.valuation', 'read')
    const pickerDate = pickerDateForPccesEffective(asOfDateIso)
    const latest = await pccesImportRepository.findLatestApprovedImport(projectId)
    const effective = await pccesImportRepository.findApprovedImportEffectiveOnLogDate(
      projectId,
      pickerDate
    )
    type RowOut = {
      pccesItemId: string
      itemKey: number
      parentItemKey: number | null
      itemNo: string
      description: string
      unit: string
      itemKind: string
      contractQty: string
      approvedQtyAfterChange: string | null
      unitPrice: string
      isStructuralLeaf: boolean
      priorBilledQty: string | null
      /** 他次估驗已請款金額加總（末層）；與（七）前期部分一致 */
      priorBilledAmount: string | null
      maxQty: string | null
      logAccumulatedQtyToDate: string | null
      suggestedAvailableQty: string | null
      /** 最新版樹之階層 path（與 PccesItem）；契約欄位可能來自有效版覆寫 */
      path: string
    }
    type GroupOut = {
      parent: { itemNo: string; description: string; unit: string; itemKey: number } | null
      children: RowOut[]
    }
    if (!latest || !effective) {
      return {
        pccesImport: null as null,
        rows: [] as RowOut[],
        groups: [] as GroupOut[],
        items: [] as RowOut[],
      }
    }

    const asOfItems =
      effective.id === latest.id
        ? null
        : await prisma.pccesItem.findMany({
            where: { importId: effective.id, ...notDeleted },
            select: {
              itemKey: true,
              itemNo: true,
              description: true,
              unit: true,
              quantity: true,
              unitPrice: true,
            },
          })
    const asOfByItemKey = new Map(
      (asOfItems ?? []).map((x) => [
        x.itemKey,
        {
          itemNo: x.itemNo,
          description: x.description,
          unit: x.unit,
          quantity: x.quantity,
          unitPrice: x.unitPrice,
        },
      ])
    )

    const allItemsRaw = await prisma.pccesItem.findMany({
      where: { importId: latest.id, ...notDeleted },
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
        path: true,
      },
    })
    const allItems = sortPccesRowsByDisplayPath(allItemsRaw)
    const parentsWithChildren = parentItemKeysWithChildren(allItems)
    const leafIds = new Set(
      allItems.filter((i) => isStructuralLeaf(i, parentsWithChildren)).map((i) => i.id)
    )
    const leafIdList = [...leafIds]

    const [priorMap, priorAmountMap] =
      leafIdList.length === 0
        ? [new Map<string, Prisma.Decimal>(), new Map<string, Prisma.Decimal>()]
        : await Promise.all([
            constructionValuationRepository.sumCurrentPeriodQtyByPccesItemsExcludingValuation(
              projectId,
              leafIdList,
              excludeValuationId
            ),
            constructionValuationRepository.sumCurrentPeriodAmountByPccesItemsExcludingValuation(
              projectId,
              leafIdList,
              excludeValuationId
            ),
          ])

    const logMap =
      leafIdList.length === 0
        ? new Map<string, Prisma.Decimal>()
        : await constructionDailyLogRepository.sumDailyQtyByPccesItemsThroughDateInclusive(
            projectId,
            leafIdList,
            pickerDate
          )

    const rows: RowOut[] = allItems.map((r) => {
      const snap = asOfByItemKey.get(r.itemKey)
      const itemNo = snap?.itemNo ?? r.itemNo
      const desc = snap?.description ?? r.description
      const unit = snap?.unit ?? r.unit
      const qty = snap?.quantity ?? r.quantity
      const price = snap?.unitPrice ?? r.unitPrice
      const isLeaf = leafIds.has(r.id)
      const cap = qty
      if (!isLeaf) {
        return {
          pccesItemId: r.id,
          itemKey: r.itemKey,
          parentItemKey: r.parentItemKey,
          itemNo,
          description: desc,
          unit,
          itemKind: r.itemKind,
          contractQty: qty.toString(),
          approvedQtyAfterChange: null as string | null,
          unitPrice: price.toString(),
          isStructuralLeaf: false,
          priorBilledQty: null,
          priorBilledAmount: null,
          maxQty: null,
          logAccumulatedQtyToDate: null,
          suggestedAvailableQty: null,
          path: r.path,
        }
      }
      const prior = priorMap.get(r.id) ?? new Prisma.Decimal(0)
      const priorAmt = priorAmountMap.get(r.id) ?? new Prisma.Decimal(0)
      const logQty = logMap.get(r.id) ?? new Prisma.Decimal(0)
      const effectiveCap = Prisma.Decimal.min(cap, logQty)
      const avail = effectiveCap.minus(prior)
      return {
        pccesItemId: r.id,
        itemKey: r.itemKey,
        parentItemKey: r.parentItemKey,
        itemNo,
        description: desc,
        unit,
        itemKind: r.itemKind,
        contractQty: qty.toString(),
        approvedQtyAfterChange: null as string | null,
        unitPrice: price.toString(),
        isStructuralLeaf: true,
        priorBilledQty: prior.toString(),
        priorBilledAmount: priorAmt.toString(),
        maxQty: cap.toString(),
        logAccumulatedQtyToDate: logQty.toString(),
        suggestedAvailableQty: (avail.isNeg() ? new Prisma.Decimal(0) : avail).toString(),
        path: r.path,
      }
    })

    const items = rows.filter((x) => x.isStructuralLeaf)

    /** 回傳「契約欄位所依版本」（估驗日有效版），`pccesItemId` 仍屬最新版列 id */
    const importMeta = await pccesImportRepository.findByIdForProject(projectId, effective.id)
    return {
      pccesImport: importMeta
        ? {
            id: importMeta.id,
            version: importMeta.version,
            approvedAt: importMeta.approvedAt?.toISOString() ?? null,
            approvedById: importMeta.approvedById,
            approvalEffectiveAt: importMeta.approvalEffectiveAt?.toISOString() ?? null,
          }
        : {
            id: effective.id,
            version: effective.version,
            approvedAt: null as string | null,
            approvedById: null as string | null,
            approvalEffectiveAt: null as string | null,
          },
      rows,
      groups: [] as GroupOut[],
      items,
    }
  },
}
