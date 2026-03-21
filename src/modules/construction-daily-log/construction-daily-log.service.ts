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
import { constructionDailyLogRepository } from './construction-daily-log.repository.js'

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

/** 日曆天數（含起訖日）；若 log 早於開工，回傳 0。 */
function elapsedCalendarDaysInclusive(start: Date, log: Date): number {
  const ua = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const ub = Date.UTC(log.getUTCFullYear(), log.getUTCMonth(), log.getUTCDate())
  const diff = Math.floor((ub - ua) / 86400000) + 1
  return Math.max(0, diff)
}

/** 預定進度（%）：依開工日與核定工期線性比例，上限 100；無足夠資料時為 null。 */
export function computePlannedProgressPercent(params: {
  logDate: Date
  startDate: Date | null
  approvedDurationDays: number | null
}): number | null {
  const { logDate, startDate, approvedDurationDays } = params
  if (!startDate || approvedDurationDays == null || approvedDurationDays <= 0) return null
  const elapsed = elapsedCalendarDaysInclusive(startDate, logDate)
  if (elapsed === 0) return 0
  const raw = (elapsed / approvedDurationDays) * 100
  return Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100
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
    if (!item) {
      throw new AppError(400, 'BAD_REQUEST', 'PCCES 工項無效或不在目前核定版本中')
    }

    const daily = decQty(w.dailyQty)
    if (daily.isNeg()) {
      throw new AppError(400, 'VALIDATION_ERROR', '本日完成數量不可為負')
    }

    const prior = priorMap.get(w.pccesItemId) ?? new Prisma.Decimal(0)
    const contract = item.quantity
    const accumulated = prior.plus(daily)
    if (accumulated.gt(contract)) {
      throw new AppError(400, 'WORK_ITEM_QTY_EXCEEDED', '累計完成數量不可超過契約數量')
    }

    nextWork.push({
      pccesItemId: item.id,
      workItemName: item.description,
      unit: item.unit,
      contractQty: contract.toString(),
      dailyQty: daily.toString(),
      accumulatedQty: accumulated.toString(),
      remark: w.remark,
    })
  }

  return { ...body, workItems: nextWork }
}

function serializeLog(
  row: NonNullable<Awaited<ReturnType<typeof constructionDailyLogRepository.findByIdForProject>>>
) {
  const plannedProgress = computePlannedProgressPercent({
    logDate: row.logDate,
    startDate: row.startDate,
    approvedDurationDays: row.approvedDurationDays,
  })

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
      workItemName: w.workItemName,
      unit: w.unit,
      contractQty: w.contractQty.toString(),
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
  row: Awaited<ReturnType<typeof constructionDailyLogRepository.listByProject>>['rows'][0]
) {
  const plannedProgress = computePlannedProgressPercent({
    logDate: row.logDate,
    startDate: row.startDate,
    approvedDurationDays: row.approvedDurationDays,
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
    return {
      data: rows.map(serializeListRow),
      meta: { page, limit, total },
    }
  },

  async getById(projectId: string, logId: string, user: AuthUser) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'read')
    const row = await constructionDailyLogRepository.findByIdForProject(projectId, logId)
    if (!row) throw new AppError(404, 'NOT_FOUND', '找不到施工日誌')
    return serializeLog(row)
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
    return serializeLog(row)
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
    return serializeLog(row)
  },

  async delete(projectId: string, logId: string, user: AuthUser) {
    await assertProjectModuleAction(user, projectId, 'construction.diary', 'delete')
    const ok = await constructionDailyLogRepository.softDelete(projectId, logId, user.id)
    if (!ok) throw new AppError(404, 'NOT_FOUND', '找不到施工日誌')
    return { ok: true as const }
  },

  /**
   * 施工日誌（一）工項選擇器：最新「已核定」版之 **general**（可填數量之末層），
   * 依 `parentItemKey` 分組並帶出**上一層父列**（僅展示項次／說明／單位，不填數量；父層必須至少有一筆子 general）。
   */
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
    type ChildOut = {
      pccesItemId: string
      itemNo: string
      workItemName: string
      unit: string
      contractQty: string
      priorAccumulatedQty: string
    }
    type GroupOut = {
      parent: { itemNo: string; workItemName: string; unit: string } | null
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
      if (!byItemKey.has(pk)) continue
      const list = childrenByParentKey.get(pk) ?? []
      list.push(g)
      childrenByParentKey.set(pk, list)
    }

    const mapChild = (r: (typeof generals)[0]): ChildOut => ({
      pccesItemId: r.id,
      itemNo: r.itemNo,
      workItemName: r.description,
      unit: r.unit,
      contractQty: r.quantity.toString(),
      priorAccumulatedQty: '0',
    })

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
          workItemName: parentRow.description,
          unit: parentRow.unit,
        },
        children: kids.map((r) => mapChild(r)),
      })
    }
    if (orphans.length > 0) {
      orphans.sort((a, b) => a.itemKey - b.itemKey)
      allChildIds.push(...orphans.map((o) => o.id))
      groups.push({
        parent: null,
        children: orphans.map((r) => mapChild(r)),
      })
    }

    const priorMap = await constructionDailyLogRepository.sumDailyQtyByPccesItemsBeforeLogDate(
      projectId,
      allChildIds,
      logDate,
      excludeLogId
    )
    for (const g of groups) {
      for (const c of g.children) {
        c.priorAccumulatedQty = (priorMap.get(c.pccesItemId) ?? new Prisma.Decimal(0)).toString()
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

  /** 新增表單預設：取自專案主檔（可再於表單覆寫） */
  async getFormDefaults(projectId: string, user: AuthUser) {
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
    return {
      projectName: p.name,
      contractorName: p.contractor ?? '',
      startDate: p.startDate ? formatDateOnlyUtc(p.startDate) : null,
      approvedDurationDays: p.plannedDurationDays ?? null,
    }
  },
}
