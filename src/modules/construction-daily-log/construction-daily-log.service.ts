import { Prisma } from '@prisma/client'
import { AppError } from '../../shared/errors.js'
import { assertProjectModuleAction } from '../project-permission/project-permission.service.js'
import { prisma } from '../../lib/db.js'
import { notDeleted } from '../../shared/soft-delete.js'
import type { ConstructionDailyLogCreateInput } from '../../schemas/construction-daily-log.js'
import {
  constructionDailyLogCreateSchema,
  constructionDailyLogUpdateSchema,
} from '../../schemas/construction-daily-log.js'
import { pccesImportRepository } from '../pcces-import/pcces-import.repository.js'
import {
  allowsUserEnteredQtyForPccesItemKind,
  isStructuralLeaf,
  parentItemKeysWithChildren,
} from '../pcces-import/pcces-item-tree.js'
import { mapLatestApprovedPccesItemIdsToItemKeys } from '../pcces-import/pcces-item-lineage.js'
import { constructionDailyLogRepository } from './construction-daily-log.repository.js'
import { constructionDailyLogPccesActualPreviewSchema } from '../../schemas/construction-daily-log-pcces-actual-preview.js'
import {
  actualProgressPercentFromAmounts,
  pickPccesContractTotalAmount,
} from './pcces-actual-progress.js'
import { resolvePlannedProgressForDailyLog } from './planned-progress-for-log.js'
import { projectProgressRepository } from '../project-progress/project-progress.repository.js'

type AuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

function formatDateOnlyUtc(d: Date): string {
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

async function normalizeConstructionDailyLogBody(
  projectId: string,
  logDate: Date,
  excludeLogId: string | undefined,
  body: ConstructionDailyLogCreateInput
): Promise<ConstructionDailyLogCreateInput> {
  const seen = new Set<string>()
  for (const w of body.workItems) {
    if (w.pccesItemId) {
      if (seen.has(w.pccesItemId)) {
        throw new AppError(400, 'VALIDATION_ERROR', '同一日誌不可重複綁定相同 PCCES 工項')
      }
      seen.add(w.pccesItemId)
    }
  }

  const pccesIds = body.workItems
    .map((w) => w.pccesItemId)
    .filter((id): id is string => Boolean(id))

  const latest = await pccesImportRepository.findLatestApprovedImport(projectId)

  let priorMap = new Map<string, Prisma.Decimal>()
  if (pccesIds.length > 0) {
    if (!latest) {
      throw new AppError(400, 'PCCES_NOT_APPROVED', '專案尚無核定之 PCCES 版本，無法綁定工項')
    }
    priorMap = await constructionDailyLogRepository.sumDailyQtyByPccesItemsBeforeLogDate(
      projectId,
      pccesIds,
      logDate,
      excludeLogId
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

  const nextWork: ConstructionDailyLogCreateInput['workItems'] = []

  for (const w of body.workItems) {
    if (!w.pccesItemId) {
      const contract = decQty(w.contractQty)
      const daily = decQty(w.dailyQty)
      const acc = decQty(w.accumulatedQty)
      if (daily.isNeg()) {
        throw new AppError(400, 'VALIDATION_ERROR', '本日完成數量不可為負')
      }
      if (acc.isNeg()) {
        throw new AppError(400, 'VALIDATION_ERROR', '累計完成數量不可為負')
      }
      if (acc.lt(daily)) {
        throw new AppError(400, 'VALIDATION_ERROR', '累計完成數量不可小於本日完成數量')
      }
      if (acc.gt(contract)) {
        throw new AppError(400, 'WORK_ITEM_QTY_EXCEEDED', '累計完成數量不可超過契約數量')
      }
      nextWork.push({
        workItemName: w.workItemName,
        unit: w.unit,
        contractQty: w.contractQty,
        dailyQty: w.dailyQty,
        accumulatedQty: w.accumulatedQty,
        remark: w.remark,
      })
      continue
    }

    const item = itemById.get(w.pccesItemId)
    if (!item || !isStructuralLeaf(item, parentsWithChildren)) {
      throw new AppError(
        400,
        'BAD_REQUEST',
        'PCCES 工項無效、非末層或不在目前核定版本中'
      )
    }

    const daily = decQty(w.dailyQty)
    if (daily.isNeg()) {
      throw new AppError(400, 'VALIDATION_ERROR', '本日完成數量不可為負')
    }
    if (!allowsUserEnteredQtyForPccesItemKind(item.itemKind) && !daily.isZero()) {
      throw new AppError(400, 'VALIDATION_ERROR', '此 PCCES 類型不可填寫本日完成數量')
    }

    const prior = priorMap.get(w.pccesItemId) ?? new Prisma.Decimal(0)
    /** 契約數／名稱／單位以請求正文快照為準，避免換版後覆寫歷史日誌列 */
    const contract = decQty(w.contractQty)
    if (contract.isNeg()) {
      throw new AppError(400, 'VALIDATION_ERROR', '契約數量不可為負')
    }
    const accumulated = prior.plus(daily)
    if (accumulated.gt(contract)) {
      throw new AppError(400, 'WORK_ITEM_QTY_EXCEEDED', '累計完成數量不可超過契約數量')
    }

    const pccesRow: ConstructionDailyLogCreateInput['workItems'][number] = {
      pccesItemId: item.id,
      workItemName: w.workItemName,
      unit: w.unit,
      contractQty: contract.toString(),
      dailyQty: daily.toString(),
      accumulatedQty: accumulated.toString(),
      remark: w.remark,
    }
    if (w.unitPrice !== undefined) {
      pccesRow.unitPrice = decQty(w.unitPrice).toString()
    }
    nextWork.push(pccesRow)
  }

  return { ...body, workItems: nextWork }
}

async function structuralLeafByPccesItemId(
  workItems: {
    pccesItemId: string | null
    pccesItem: { importId: string; itemKey: number } | null
  }[]
): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>()
  const importIds = new Set<string>()
  for (const w of workItems) {
    if (w.pccesItemId && w.pccesItem) importIds.add(w.pccesItem.importId)
  }
  const parentsByImport = new Map<string, Set<number>>()
  for (const iid of importIds) {
    const shape = await prisma.pccesItem.findMany({
      where: { importId: iid, ...notDeleted },
      select: { itemKey: true, parentItemKey: true },
    })
    parentsByImport.set(iid, parentItemKeysWithChildren(shape))
  }
  for (const w of workItems) {
    if (!w.pccesItemId || !w.pccesItem) continue
    const parents = parentsByImport.get(w.pccesItem.importId)
    if (!parents) continue
    map.set(
      w.pccesItemId,
      isStructuralLeaf({ itemKey: w.pccesItem.itemKey }, parents)
    )
  }
  return map
}

async function serializeLog(
  row: NonNullable<Awaited<ReturnType<typeof constructionDailyLogRepository.findByIdForProject>>>,
  knots: Array<{ periodDate: string; cumulativePlanned: string }> | null
) {
  const plannedProgress = resolvePlannedProgressForDailyLog({
    logDate: row.logDate,
    startDate: row.startDate,
    approvedDurationDays: row.approvedDurationDays,
    knots,
  })

  const leafByPccesItemId = await structuralLeafByPccesItemId(row.workItems)

  return {
    id: row.id,
    projectId: row.projectId,
    reportNo: row.reportNo,
    weatherAm: row.weatherAm,
    weatherPm: row.weatherPm,
    logDate: formatDateOnlyUtc(row.logDate),
    projectName: row.projectName,
    contractorName: row.contractorName,
    approvedDurationDays: row.approvedDurationDays,
    accumulatedDays: row.accumulatedDays,
    remainingDays: row.remainingDays,
    extendedDays: row.extendedDays,
    startDate: row.startDate ? formatDateOnlyUtc(row.startDate) : null,
    completionDate: row.completionDate ? formatDateOnlyUtc(row.completionDate) : null,
    plannedProgress,
    progressPlanKnots: knots ?? [],
    actualProgress: serializeDecimal(row.actualProgress),
    specialItemA: row.specialItemA,
    specialItemB: row.specialItemB,
    hasTechnician: row.hasTechnician,
    preWorkEducation: row.preWorkEducation,
    newWorkerInsurance: row.newWorkerInsurance,
    ppeCheck: row.ppeCheck,
    otherSafetyNotes: row.otherSafetyNotes,
    sampleTestRecord: row.sampleTestRecord,
    subcontractorNotice: row.subcontractorNotice,
    importantNotes: row.importantNotes,
    siteManagerSigned: row.siteManagerSigned,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    workItems: row.workItems.map((w) => ({
      id: w.id,
      pccesItemId: w.pccesItemId,
      itemNo: w.pccesItem?.itemNo ?? null,
      pccesItemKind: w.pccesItem?.itemKind ?? null,
      pccesStructuralLeaf:
        w.pccesItemId == null
          ? null
          : (leafByPccesItemId.get(w.pccesItemId) ?? true),
      workItemName: w.workItemName,
      unit: w.unit,
      contractQty: w.contractQty.toString(),
      unitPrice: w.unitPrice != null ? w.unitPrice.toString() : null,
      dailyQty: w.dailyQty.toString(),
      accumulatedQty: w.accumulatedQty.toString(),
      remark: w.remark,
    })),
    materials: row.materials.map((m) => ({
      id: m.id,
      materialName: m.materialName,
      unit: m.unit,
      contractQty: m.contractQty.toString(),
      dailyUsedQty: m.dailyUsedQty.toString(),
      accumulatedQty: m.accumulatedQty.toString(),
      remark: m.remark,
    })),
    personnelEquipmentRows: row.personnelEquipmentRows.map((p) => ({
      id: p.id,
      workType: p.workType,
      dailyWorkers: p.dailyWorkers,
      accumulatedWorkers: p.accumulatedWorkers,
      equipmentName: p.equipmentName,
      dailyEquipmentQty: p.dailyEquipmentQty.toString(),
      accumulatedEquipmentQty: p.accumulatedEquipmentQty.toString(),
    })),
  }
}

function serializeListRow(
  row: Awaited<ReturnType<typeof constructionDailyLogRepository.listByProject>>['rows'][0],
  knots: Array<{ periodDate: string; cumulativePlanned: string }> | null
) {
  const plannedProgress = resolvePlannedProgressForDailyLog({
    logDate: row.logDate,
    startDate: row.startDate,
    approvedDurationDays: row.approvedDurationDays,
    knots,
  })
  return {
    id: row.id,
    logDate: formatDateOnlyUtc(row.logDate),
    reportNo: row.reportNo,
    weatherAm: row.weatherAm,
    weatherPm: row.weatherPm,
    projectName: row.projectName,
    plannedProgress,
    actualProgress: serializeDecimal(row.actualProgress),
    createdAt: row.createdAt.toISOString(),
  }
}

export const constructionDailyLogService = {
  async list(projectId: string, user: AuthUser, page: number, limit: number) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'read')
    const skip = (page - 1) * limit
    const { rows, total } = await constructionDailyLogRepository.listByProject(projectId, {
      skip,
      take: limit,
    })
    const uniqueYmds = [...new Set(rows.map((r) => formatDateOnlyUtc(r.logDate)))]
    const knotsByYmd = new Map<
      string,
      Array<{ periodDate: string; cumulativePlanned: string }> | null
    >()
    for (const ymd of uniqueYmds) {
      const d = new Date(`${ymd}T12:00:00.000Z`)
      const k = await projectProgressRepository.getProgressPlanCumulativeKnotsForLogDate(
        projectId,
        d
      )
      knotsByYmd.set(ymd, k)
    }
    return {
      data: rows.map((r) => {
        const k = knotsByYmd.get(formatDateOnlyUtc(r.logDate))
        return serializeListRow(r, k && k.length > 0 ? k : null)
      }),
      meta: { page, limit, total },
    }
  },

  async getById(projectId: string, logId: string, user: AuthUser) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'read')
    const row = await constructionDailyLogRepository.findByIdForProject(projectId, logId)
    if (!row) throw new AppError(404, 'NOT_FOUND', '找不到施工日誌')
    const knots = await projectProgressRepository.getProgressPlanCumulativeKnotsForLogDate(
      projectId,
      row.logDate
    )
    return await serializeLog(row, knots)
  },

  async create(projectId: string, user: AuthUser, raw: unknown) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'create')
    const parsed = constructionDailyLogCreateSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', '資料驗證失敗')
    }
    const body = parsed.data
    const logDate = new Date(body.logDate + 'T12:00:00.000Z')
    if (Number.isNaN(logDate.getTime())) {
      throw new AppError(400, 'BAD_REQUEST', '填表日期無效')
    }
    const dup = await constructionDailyLogRepository.findDuplicateLogDate(projectId, logDate)
    if (dup) {
      throw new AppError(409, 'CONFLICT', '該填表日期已有施工日誌')
    }
    const normalized = await normalizeConstructionDailyLogBody(projectId, logDate, undefined, body)
    const id = await constructionDailyLogRepository.create(projectId, user.id, normalized)
    const row = await constructionDailyLogRepository.findByIdForProject(projectId, id)
    if (!row) throw new AppError(500, 'INTERNAL_ERROR', '建立後讀取失敗')
    const knots = await projectProgressRepository.getProgressPlanCumulativeKnotsForLogDate(
      projectId,
      logDate
    )
    return serializeLog(row, knots)
  },

  async update(projectId: string, logId: string, user: AuthUser, raw: unknown) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'update')
    const parsed = constructionDailyLogUpdateSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', '資料驗證失敗')
    }
    const body = parsed.data
    const logDate = new Date(body.logDate + 'T12:00:00.000Z')
    if (Number.isNaN(logDate.getTime())) {
      throw new AppError(400, 'BAD_REQUEST', '填表日期無效')
    }
    const dup = await constructionDailyLogRepository.findDuplicateLogDate(projectId, logDate, logId)
    if (dup) {
      throw new AppError(409, 'CONFLICT', '該填表日期已有其他施工日誌')
    }
    const normalized = await normalizeConstructionDailyLogBody(projectId, logDate, logId, body)
    const ok = await constructionDailyLogRepository.update(projectId, logId, normalized)
    if (!ok) throw new AppError(404, 'NOT_FOUND', '找不到施工日誌')
    const row = await constructionDailyLogRepository.findByIdForProject(projectId, logId)
    if (!row) throw new AppError(500, 'INTERNAL_ERROR', '更新後讀取失敗')
    const knots = await projectProgressRepository.getProgressPlanCumulativeKnotsForLogDate(
      projectId,
      logDate
    )
    return await serializeLog(row, knots)
  },

  async delete(projectId: string, logId: string, user: AuthUser) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'delete')
    const ok = await constructionDailyLogRepository.softDelete(projectId, logId, user.id)
    if (!ok) throw new AppError(404, 'NOT_FOUND', '找不到施工日誌')
    return { ok: true as const }
  },

  /**
   * 施工日誌（一）工項選擇器：**樹狀與 pccesItemId 為「最新核定版」**（儲存時與 normalize 一致）；
   * **契約數量、單價、工程名稱、單位**依 **填表日** 對應之「當日有效核定版」以 **itemKey** 覆寫；有效版以匯入紀錄之 **核定生效時間**（未填則以核定操作日）與版次決定。
   * 累計（迄前日）仍依 itemKey 跨版加總。排序同「PCCES 明細」：**itemKey 升序**；`isStructuralLeaf` false 為目錄列。
   */
  /**
   * 依最新核定 PCCES：葉節點 general 之（累計完成量×單價）加總／總工程費×100。
   * 累計完成量＝各版族譜之 dailyQty 截至填表日（含）；編輯時排除本日誌並以 overlay 帶入表單本日完成量。
   */
  async previewPccesActualProgress(projectId: string, user: AuthUser, raw: unknown) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'read')
    const parsed = constructionDailyLogPccesActualPreviewSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', '資料驗證失敗')
    }
    const { logDate, excludeLogId, overlayWorkItems } = parsed.data
    const logDateObj = new Date(`${logDate}T12:00:00.000Z`)
    if (Number.isNaN(logDateObj.getTime())) {
      throw new AppError(400, 'BAD_REQUEST', '填表日期無效')
    }

    const latest = await pccesImportRepository.findLatestApprovedImport(projectId)
    if (!latest) {
      throw new AppError(400, 'PCCES_NOT_APPROVED', '專案尚無核定之 PCCES 版本')
    }

    const rootRows = await prisma.pccesItem.findMany({
      where: { importId: latest.id, parentItemKey: null, ...notDeleted },
      select: {
        itemKey: true,
        parentItemKey: true,
        itemNo: true,
        description: true,
        amountImported: true,
      },
    })
    const contractTotal = pickPccesContractTotalAmount(rootRows)
    if (contractTotal == null) {
      throw new AppError(
        400,
        'PCCES_CONTRACT_TOTAL_MISSING',
        '無法取得總工程費（頂層壹／發包工程費金額）；請確認 PCCES 匯入資料'
      )
    }

    const treeShape = await prisma.pccesItem.findMany({
      where: { importId: latest.id, ...notDeleted },
      select: { itemKey: true, parentItemKey: true },
    })
    const parentsWithChildren = parentItemKeysWithChildren(treeShape)

    const generalItems = await prisma.pccesItem.findMany({
      where: {
        importId: latest.id,
        itemKind: 'general',
        ...notDeleted,
      },
      select: { id: true, itemKey: true, unitPrice: true },
      orderBy: { itemKey: 'asc' },
    })
    const leaves = generalItems.filter((r) =>
      isStructuralLeaf({ itemKey: r.itemKey }, parentsWithChildren)
    )
    if (leaves.length === 0) {
      throw new AppError(400, 'PCCES_NO_LEAVES', '最新核定版無可供計算之一般葉節點工項')
    }

    const itemKeys = leaves.map((x) => x.itemKey)
    const sumByKey = await constructionDailyLogRepository.sumDailyQtyByItemKeysThroughLogDateInclusive(
      projectId,
      itemKeys,
      logDateObj,
      excludeLogId
    )

    const overlayIds = overlayWorkItems.map((x) => x.pccesItemId)
    const idToKey =
      overlayIds.length > 0
        ? await mapLatestApprovedPccesItemIdsToItemKeys(projectId, overlayIds)
        : new Map<string, number>()

    for (const row of overlayWorkItems) {
      const key = idToKey.get(row.pccesItemId)
      if (key === undefined) continue
      let d: Prisma.Decimal
      try {
        const rawQty = row.dailyQty.trim() === '' ? '0' : row.dailyQty.replace(/,/g, '')
        d = new Prisma.Decimal(rawQty)
      } catch {
        d = new Prisma.Decimal(0)
      }
      if (d.isNeg()) continue
      sumByKey.set(key, (sumByKey.get(key) ?? new Prisma.Decimal(0)).plus(d))
    }

    let weighted = new Prisma.Decimal(0)
    for (const leaf of leaves) {
      const qty = sumByKey.get(leaf.itemKey) ?? new Prisma.Decimal(0)
      weighted = weighted.plus(qty.mul(leaf.unitPrice))
    }

    const actualProgress = actualProgressPercentFromAmounts(weighted, contractTotal)

    return {
      actualProgress,
      contractTotalAmount: contractTotal.toString(),
      weightedDoneAmount: weighted.toString(),
      generalLeafCount: leaves.length,
    }
  },

  async getPccesWorkItemPicker(
    projectId: string,
    user: AuthUser,
    logDateIso: string,
    excludeLogId?: string
  ) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'read')
    const logDate = new Date(`${logDateIso}T12:00:00.000Z`)
    if (Number.isNaN(logDate.getTime())) {
      throw new AppError(400, 'BAD_REQUEST', '填表日期無效')
    }
    const latest = await pccesImportRepository.findLatestApprovedImport(projectId)
    const effective = await pccesImportRepository.findApprovedImportEffectiveOnLogDate(
      projectId,
      logDate
    )
    type RowOut = {
      pccesItemId: string
      itemKey: number
      parentItemKey: number | null
      itemNo: string
      itemKind: string
      workItemName: string
      unit: string
      contractQty: string
      unitPrice: string
      isStructuralLeaf: boolean
      /** 非末層為 null */
      priorAccumulatedQty: string | null
    }
    type GroupOut = {
      parent: { itemNo: string; workItemName: string; unit: string } | null
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
    const parentsWithChildrenPicker = parentItemKeysWithChildren(allItems)
    const leafIds = new Set(
      allItems.filter((i) => isStructuralLeaf(i, parentsWithChildrenPicker)).map((i) => i.id)
    )
    const leafIdList = [...leafIds]

    const priorMap =
      leafIdList.length === 0
        ? new Map<string, Prisma.Decimal>()
        : await constructionDailyLogRepository.sumDailyQtyByPccesItemsBeforeLogDate(
            projectId,
            leafIdList,
            logDate,
            excludeLogId
          )

    const rows: RowOut[] = allItems.map((r) => {
      const isLeaf = leafIds.has(r.id)
      const snap = asOfByItemKey.get(r.itemKey)
      const itemNo = snap?.itemNo ?? r.itemNo
      const desc = snap?.description ?? r.description
      const unit = snap?.unit ?? r.unit
      const qty = snap?.quantity ?? r.quantity
      const price = snap?.unitPrice ?? r.unitPrice
      return {
        pccesItemId: r.id,
        itemKey: r.itemKey,
        parentItemKey: r.parentItemKey,
        itemNo,
        itemKind: r.itemKind,
        workItemName: desc,
        unit,
        contractQty: qty.toString(),
        unitPrice: price.toString(),
        isStructuralLeaf: isLeaf,
        priorAccumulatedQty: isLeaf
          ? (priorMap.get(r.id) ?? new Prisma.Decimal(0)).toString()
          : null,
      }
    })

    const items = rows.filter((x) => x.isStructuralLeaf)

    /** 回傳「契約欄位所依版本」（填表日有效版），與 `pccesItemId` 所屬之最新版可能不同 */
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

  /** 新增表單預設：取自專案主檔（可再於表單覆寫） */
  async getFormDefaults(projectId: string, user: AuthUser, logDateIso?: string) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'read')
    const p = await prisma.project.findFirst({
      where: { id: projectId, ...notDeleted },
      select: {
        name: true,
        contractor: true,
        startDate: true,
        plannedDurationDays: true,
      },
    })
    if (!p) throw new AppError(404, 'NOT_FOUND', '找不到專案')
    let knotDate = new Date()
    if (typeof logDateIso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(logDateIso)) {
      const parsed = new Date(`${logDateIso}T12:00:00.000Z`)
      if (!Number.isNaN(parsed.getTime())) knotDate = parsed
    }
    const k = await projectProgressRepository.getProgressPlanCumulativeKnotsForLogDate(
      projectId,
      knotDate
    )
    const progressPlanKnots = k ?? []
    return {
      projectName: p.name,
      contractorName: p.contractor ?? '',
      startDate: p.startDate ? formatDateOnlyUtc(p.startDate) : null,
      approvedDurationDays: p.plannedDurationDays ?? null,
      progressPlanKnots,
    }
  },

  /** 僅供表單切換填表日時更新預定進度內插節點（依該日有效之進度計畫變更版） */
  async getProgressPlanKnotsForLogDate(projectId: string, user: AuthUser, logDateIso: string) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'read')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(logDateIso)) {
      throw new AppError(400, 'BAD_REQUEST', '請提供有效之 logDate（YYYY-MM-DD）')
    }
    const logDate = new Date(`${logDateIso}T12:00:00.000Z`)
    if (Number.isNaN(logDate.getTime())) {
      throw new AppError(400, 'BAD_REQUEST', '填表日期無效')
    }
    const k = await projectProgressRepository.getProgressPlanCumulativeKnotsForLogDate(
      projectId,
      logDate
    )
    return { progressPlanKnots: k ?? [] }
  },
}
