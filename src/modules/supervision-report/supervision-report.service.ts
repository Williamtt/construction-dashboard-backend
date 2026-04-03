import { Prisma } from '@prisma/client'
import { AppError } from '../../shared/errors.js'
import { assertProjectModuleAction } from '../project-permission/project-permission.service.js'
import { prisma } from '../../lib/db.js'
import { notDeleted } from '../../shared/soft-delete.js'
import type { SupervisionReportCreateInput } from '../../schemas/supervision-report.js'
import {
  supervisionReportCreateSchema,
  supervisionReportUpdateSchema,
} from '../../schemas/supervision-report.js'
import { pccesImportRepository } from '../pcces-import/pcces-import.repository.js'
import {
  isStructuralLeaf,
  parentItemKeysWithChildren,
} from '../pcces-import/pcces-item-tree.js'
import { projectProgressRepository } from '../project-progress/project-progress.repository.js'
import { supervisionReportRepository } from './supervision-report.repository.js'

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

/**
 * 正規化工作項目：驗證 PCCES 綁定、計算累計數量
 */
async function normalizeWorkItems(
  projectId: string,
  reportDate: Date,
  excludeReportId: string | undefined,
  body: SupervisionReportCreateInput
): Promise<SupervisionReportCreateInput> {
  const seen = new Set<string>()
  for (const w of body.workItems) {
    if (w.pccesItemId) {
      if (seen.has(w.pccesItemId)) {
        throw new AppError(400, 'VALIDATION_ERROR', '同一報表不可重複綁定相同 PCCES 工項')
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
    priorMap = await supervisionReportRepository.sumDailyQtyByPccesItemsBeforeReportDate(
      projectId,
      pccesIds,
      reportDate,
      excludeReportId
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
          where: { id: { in: pccesIds }, importId: latest!.id, ...notDeleted },
        })
  const itemById = new Map(items.map((i) => [i.id, i]))

  const nextWork: SupervisionReportCreateInput['workItems'] = []

  for (const w of body.workItems) {
    if (!w.pccesItemId) {
      // 手填列
      const daily = decQty(w.dailyCompletedQty)
      const acc = decQty(w.accumulatedCompletedQty)
      if (daily.isNeg()) throw new AppError(400, 'VALIDATION_ERROR', '本日完成數量不可為負')
      if (acc.isNeg()) throw new AppError(400, 'VALIDATION_ERROR', '累計完成數量不可為負')
      nextWork.push({
        workItemName: w.workItemName,
        unit: w.unit,
        contractQty: w.contractQty,
        dailyCompletedQty: w.dailyCompletedQty,
        accumulatedCompletedQty: w.accumulatedCompletedQty,
        remark: w.remark,
      })
      continue
    }

    const item = itemById.get(w.pccesItemId)
    if (!item || !isStructuralLeaf(item, parentsWithChildren)) {
      throw new AppError(400, 'BAD_REQUEST', 'PCCES 工項無效、非末層或不在目前核定版本中')
    }

    const daily = decQty(w.dailyCompletedQty)
    if (daily.isNeg()) throw new AppError(400, 'VALIDATION_ERROR', '本日完成數量不可為負')

    const prior = priorMap.get(w.pccesItemId) ?? new Prisma.Decimal(0)
    const contract = decQty(w.contractQty)
    const accumulated = prior.plus(daily)

    nextWork.push({
      pccesItemId: item.id,
      workItemName: w.workItemName,
      unit: w.unit,
      contractQty: contract.toString(),
      dailyCompletedQty: daily.toString(),
      accumulatedCompletedQty: accumulated.toString(),
      remark: w.remark,
    })
  }

  return { ...body, workItems: nextWork }
}

function serializeReport(
  row: NonNullable<Awaited<ReturnType<typeof supervisionReportRepository.findByIdForProject>>>
) {
  return {
    id: row.id,
    projectId: row.projectId,
    reportNo: row.reportNo,
    weatherAm: row.weatherAm,
    weatherPm: row.weatherPm,
    reportDate: formatDateOnlyUtc(row.reportDate),
    projectName: row.projectName,
    contractDuration: row.contractDuration,
    startDate: row.startDate ? formatDateOnlyUtc(row.startDate) : null,
    plannedCompletionDate: row.plannedCompletionDate
      ? formatDateOnlyUtc(row.plannedCompletionDate)
      : null,
    actualCompletionDate: row.actualCompletionDate
      ? formatDateOnlyUtc(row.actualCompletionDate)
      : null,
    contractChangeCount: row.contractChangeCount,
    extensionDays: row.extensionDays,
    originalContractAmount: serializeDecimal(row.originalContractAmount),
    designFee: serializeDecimal(row.designFee),
    contractTotal: serializeDecimal(row.contractTotal),
    constructionPlannedProgress: serializeDecimal(row.constructionPlannedProgress),
    constructionActualProgress: serializeDecimal(row.constructionActualProgress),
    overallPlannedProgress: serializeDecimal(row.overallPlannedProgress),
    overallActualProgress: serializeDecimal(row.overallActualProgress),
    inspectionNotes: row.inspectionNotes,
    materialQualityNotes: row.materialQualityNotes,
    preWorkCheckCompleted: row.preWorkCheckCompleted,
    safetyNotes: row.safetyNotes,
    otherSupervisionNotes: row.otherSupervisionNotes,
    supervisorSigned: row.supervisorSigned,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    inspections: row.inspections.map((item) => ({
      id: item.id,
      category: item.category,
      description: item.description,
    })),
    materialChecks: row.materialChecks.map((item) => ({
      id: item.id,
      category: item.category,
      description: item.description,
      referenceNo: item.referenceNo,
    })),
    workItems: row.workItems.map((w) => ({
      id: w.id,
      pccesItemId: w.pccesItemId,
      itemNo: w.pccesItem?.itemNo ?? null,
      pccesItemKind: w.pccesItem?.itemKind ?? null,
      workItemName: w.workItemName,
      unit: w.unit,
      contractQty: w.contractQty.toString(),
      dailyCompletedQty: w.dailyCompletedQty.toString(),
      accumulatedCompletedQty: w.accumulatedCompletedQty.toString(),
      remark: w.remark,
    })),
  }
}

function serializeListRow(row: import('@prisma/client').SupervisionReport) {
  return {
    id: row.id,
    reportDate: formatDateOnlyUtc(row.reportDate),
    reportNo: row.reportNo,
    weatherAm: row.weatherAm,
    weatherPm: row.weatherPm,
    projectName: row.projectName,
    constructionPlannedProgress: serializeDecimal(row.constructionPlannedProgress),
    constructionActualProgress: serializeDecimal(row.constructionActualProgress),
    overallPlannedProgress: serializeDecimal(row.overallPlannedProgress),
    overallActualProgress: serializeDecimal(row.overallActualProgress),
    createdAt: row.createdAt.toISOString(),
  }
}

export const supervisionReportService = {
  async list(projectId: string, user: AuthUser, page: number, limit: number) {
    await assertProjectModuleAction(user, projectId, 'construction.supervision', 'read')
    const skip = (page - 1) * limit
    const { rows, total } = await supervisionReportRepository.listByProject(projectId, {
      skip,
      take: limit,
    })
    return {
      data: rows.map(serializeListRow),
      meta: { page, limit, total },
    }
  },

  async getById(projectId: string, reportId: string, user: AuthUser) {
    await assertProjectModuleAction(user, projectId, 'construction.supervision', 'read')
    const row = await supervisionReportRepository.findByIdForProject(projectId, reportId)
    if (!row) throw new AppError(404, 'NOT_FOUND', '找不到監造報表')
    return serializeReport(row)
  },

  async create(projectId: string, user: AuthUser, raw: unknown) {
    await assertProjectModuleAction(user, projectId, 'construction.supervision', 'create')
    const parsed = supervisionReportCreateSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', '資料驗證失敗')
    }
    const body = parsed.data
    const reportDate = new Date(body.reportDate + 'T12:00:00.000Z')
    if (Number.isNaN(reportDate.getTime())) {
      throw new AppError(400, 'BAD_REQUEST', '填報日期無效')
    }
    const dup = await supervisionReportRepository.findDuplicateReportDate(projectId, reportDate)
    if (dup) {
      throw new AppError(409, 'CONFLICT', '該填報日期已有監造報表')
    }
    const normalized = await normalizeWorkItems(projectId, reportDate, undefined, body)
    const id = await supervisionReportRepository.create(projectId, user.id, normalized)
    const row = await supervisionReportRepository.findByIdForProject(projectId, id)
    if (!row) throw new AppError(500, 'INTERNAL_ERROR', '建立後讀取失敗')
    return serializeReport(row)
  },

  async update(projectId: string, reportId: string, user: AuthUser, raw: unknown) {
    await assertProjectModuleAction(user, projectId, 'construction.supervision', 'update')
    const parsed = supervisionReportUpdateSchema.safeParse(raw)
    if (!parsed.success) {
      throw new AppError(400, 'VALIDATION_ERROR', '資料驗證失敗')
    }
    const body = parsed.data
    const reportDate = new Date(body.reportDate + 'T12:00:00.000Z')
    if (Number.isNaN(reportDate.getTime())) {
      throw new AppError(400, 'BAD_REQUEST', '填報日期無效')
    }
    const dup = await supervisionReportRepository.findDuplicateReportDate(
      projectId,
      reportDate,
      reportId
    )
    if (dup) {
      throw new AppError(409, 'CONFLICT', '該填報日期已有其他監造報表')
    }
    const normalized = await normalizeWorkItems(projectId, reportDate, reportId, body)
    const ok = await supervisionReportRepository.update(projectId, reportId, normalized)
    if (!ok) throw new AppError(404, 'NOT_FOUND', '找不到監造報表')
    const row = await supervisionReportRepository.findByIdForProject(projectId, reportId)
    if (!row) throw new AppError(500, 'INTERNAL_ERROR', '更新後讀取失敗')
    return serializeReport(row)
  },

  async delete(projectId: string, reportId: string, user: AuthUser) {
    await assertProjectModuleAction(user, projectId, 'construction.supervision', 'delete')
    const ok = await supervisionReportRepository.softDelete(projectId, reportId, user.id)
    if (!ok) throw new AppError(404, 'NOT_FOUND', '找不到監造報表')
    return { ok: true as const }
  },

  async getFormDefaults(projectId: string, user: AuthUser, reportDate?: string) {
    await assertProjectModuleAction(user, projectId, 'construction.supervision', 'read')
    const p = await prisma.project.findFirst({
      where: { id: projectId, ...notDeleted },
      select: {
        name: true,
        contractor: true,
        supervisionUnit: true,
        startDate: true,
        plannedDurationDays: true,
        plannedEndDate: true,
        revisedEndDate: true,
      },
    })
    if (!p) throw new AppError(404, 'NOT_FOUND', '找不到專案')

    // 工期展延天數：累計核定展延天數
    const extensionSum = await prisma.projectScheduleAdjustment.aggregate({
      where: { projectId, status: 'approved', type: 'extension', deletedAt: null },
      _sum: { approvedDays: true },
    })

    // 契約變更次數：已核定 PCCES 匯入次數 - 1（第一次為原始合約）
    const pccesCount = await prisma.pccesImport.count({
      where: { projectId, approvedAt: { not: null }, deletedAt: null },
    })

    // 施工預定進度：依填報日期從進度計畫插值
    let constructionPlannedProgress: string | null = null
    if (reportDate && /^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      const reportDateObj = new Date(`${reportDate}T12:00:00.000Z`)
      const knots = await projectProgressRepository.getProgressPlanCumulativeKnotsForLogDate(
        projectId,
        reportDateObj
      )
      if (knots?.length) {
        // 找填報日期當期或之前最近一期的累計預定 %
        const match = [...knots].reverse().find((k) => k.periodDate <= reportDate)
        constructionPlannedProgress = match?.cumulativePlanned ?? knots[0]?.cumulativePlanned ?? null
      }
    }

    return {
      projectName: p.name,
      contractorName: p.contractor ?? '',
      supervisionUnit: p.supervisionUnit ?? '',
      startDate: p.startDate ? formatDateOnlyUtc(p.startDate) : null,
      contractDuration: p.plannedDurationDays ?? null,
      // 優先用含展延的竣工日，fallback 到原預定完工日
      plannedCompletionDate: (p.revisedEndDate ?? p.plannedEndDate)
        ? formatDateOnlyUtc((p.revisedEndDate ?? p.plannedEndDate)!)
        : null,
      extensionDays: extensionSum._sum.approvedDays ?? 0,
      contractChangeCount: Math.max(0, pccesCount - 1),
      constructionPlannedProgress,
    }
  },

  /**
   * PCCES 工項選擇器：回傳最新核定版全部末層工項 + 歷史累計
   */
  async getPccesWorkItemPicker(
    projectId: string,
    user: AuthUser,
    reportDateIso: string,
    excludeReportId?: string
  ) {
    await assertProjectModuleAction(user, projectId, 'construction.supervision', 'read')
    const reportDate = new Date(`${reportDateIso}T12:00:00.000Z`)
    if (Number.isNaN(reportDate.getTime())) {
      throw new AppError(400, 'BAD_REQUEST', '填報日期無效')
    }

    const latest = await pccesImportRepository.findLatestApprovedImport(projectId)
    if (!latest) {
      return { pccesImport: null, items: [] }
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

    const parentsWithChildren = parentItemKeysWithChildren(allItems)
    const leafIds = allItems
      .filter((i) => isStructuralLeaf(i, parentsWithChildren))
      .map((i) => i.id)

    const priorMap =
      leafIds.length === 0
        ? new Map<string, Prisma.Decimal>()
        : await supervisionReportRepository.sumDailyQtyByPccesItemsBeforeReportDate(
            projectId,
            leafIds,
            reportDate,
            excludeReportId
          )

    const items = allItems.map((r) => {
      const isLeaf = leafIds.includes(r.id)
      return {
        pccesItemId: r.id,
        itemKey: r.itemKey,
        parentItemKey: r.parentItemKey,
        itemNo: r.itemNo,
        itemKind: r.itemKind,
        workItemName: r.description,
        unit: r.unit,
        contractQty: r.quantity.toString(),
        unitPrice: r.unitPrice.toString(),
        isStructuralLeaf: isLeaf,
        priorAccumulatedQty: isLeaf
          ? (priorMap.get(r.id) ?? new Prisma.Decimal(0)).toString()
          : null,
      }
    })

    return {
      pccesImport: { id: latest.id, version: latest.version },
      items,
    }
  },

  /**
   * 匯出 Excel：主表（第1頁）+ 完成工程詳細表（第2頁）
   * 完成工程詳細表顯示全部 PCCES 末層項目，有當日活動的才填本日量
   */
  async exportExcel(projectId: string, reportId: string, user: AuthUser): Promise<Buffer> {
    await assertProjectModuleAction(user, projectId, 'construction.supervision', 'read')
    const row = await supervisionReportRepository.findByIdForProject(projectId, reportId)
    if (!row) throw new AppError(404, 'NOT_FOUND', '找不到監造報表')

    // 取得全部 PCCES 末層項目以建立完整詳細表
    const latest = await pccesImportRepository.findLatestApprovedImport(projectId)
    let allLeafItems: Array<{
      id: string
      itemNo: string
      description: string
      unit: string
      quantity: Prisma.Decimal
    }> = []
    if (latest) {
      const allItems = await prisma.pccesItem.findMany({
        where: { importId: latest.id, ...notDeleted },
        orderBy: { itemKey: 'asc' },
        select: {
          id: true,
          itemKey: true,
          parentItemKey: true,
          itemNo: true,
          description: true,
          unit: true,
          quantity: true,
        },
      })
      const parentsWithChildren = parentItemKeysWithChildren(allItems)
      allLeafItems = allItems.filter((i) => isStructuralLeaf(i, parentsWithChildren))
    }

    // 建立本報表工作項目 lookup（by pccesItemId）
    const workItemByPccesId = new Map(
      row.workItems
        .filter((w) => w.pccesItemId)
        .map((w) => [w.pccesItemId!, w])
    )

    // 歷史累計 lookup
    const leafIds = allLeafItems.map((i) => i.id)
    const priorMap =
      leafIds.length === 0
        ? new Map<string, Prisma.Decimal>()
        : await supervisionReportRepository.sumDailyQtyByPccesItemsBeforeReportDate(
            projectId,
            leafIds,
            row.reportDate
          )

    const { default: ExcelJS } = await import('exceljs')
    const workbook = new ExcelJS.Workbook()

    // ===== Sheet 1：公共工程監造報表 =====
    const ws1 = workbook.addWorksheet('公共工程監造報表')
    ws1.columns = [
      { width: 5 },  // A
      { width: 14 }, // B
      { width: 14 }, // C
      { width: 14 }, // D
      { width: 14 }, // E
      { width: 14 }, // F
      { width: 14 }, // G
      { width: 14 }, // H
    ]

    const titleRow = ws1.addRow(['公共工程監造報表'])
    ws1.mergeCells(titleRow.number, 1, titleRow.number, 8)
    titleRow.getCell(1).font = { bold: true, size: 16 }
    titleRow.getCell(1).alignment = { horizontal: 'center' }

    const reportDateStr = formatDateOnlyUtc(row.reportDate)

    ws1.addRow([
      '本日天氣：',
      `上午：${row.weatherAm ?? ''}`,
      '',
      `下午：${row.weatherPm ?? ''}`,
      '',
      '填報日期：',
      reportDateStr,
    ])
    ws1.addRow(['工程名稱', row.projectName])
    ws1.addRow([
      '契約工期',
      row.contractDuration ?? '',
      '工程開工日期',
      row.startDate ? formatDateOnlyUtc(row.startDate) : '',
      '預定完工日期',
      row.plannedCompletionDate ? formatDateOnlyUtc(row.plannedCompletionDate) : '',
    ])
    ws1.addRow([
      '契約變更次數',
      row.contractChangeCount ?? '',
      '次',
      '工期展延天數',
      row.extensionDays ?? '',
      '天',
    ])
    ws1.addRow([
      '原契約工程費：',
      serializeDecimal(row.originalContractAmount) ?? '',
      '',
      '原契約設計相關費：',
      serializeDecimal(row.designFee) ?? '',
    ])
    ws1.addRow([
      '契約總價：',
      serializeDecimal(row.contractTotal) ?? '',
    ])
    ws1.addRow([
      '施工預定進度(%)',
      serializeDecimal(row.constructionPlannedProgress) ?? '',
      '施工實際進度(%)',
      serializeDecimal(row.constructionActualProgress) ?? '',
    ])
    ws1.addRow([
      '全案預定進度(%)',
      serializeDecimal(row.overallPlannedProgress) ?? '',
      '全案實際進度(%)',
      serializeDecimal(row.overallActualProgress) ?? '',
    ])

    ws1.addRow([])

    // 一、工程進行情況
    ws1.addRow(['一、工程進行情況（含約定之重要施工項目及數量）：'])
    for (const w of row.workItems) {
      ws1.addRow([
        '',
        w.workItemName,
        '',
        `本日：${w.dailyCompletedQty}`,
        w.unit,
        `累計：${w.accumulatedCompletedQty}`,
      ])
    }
    ws1.addRow([])

    // 二、施工查驗
    ws1.addRow(['二、監督依照設計圖說及核定施工圖說施工（含約定之檢驗停留點及施工抽查等情形）：'])
    const categoryLabel: Record<string, string> = {
      random_check: '【施工不定期抽查】',
      civil: '【土建施工查驗】',
      mep: '【機電施工查驗】',
      deficiency: '【施工不合格缺失】',
    }
    for (const cat of ['random_check', 'civil', 'mep', 'deficiency'] as const) {
      const items = row.inspections.filter((i) => i.category === cat)
      ws1.addRow(['', categoryLabel[cat]])
      if (items.length === 0) {
        ws1.addRow(['', '無。'])
      } else {
        items.forEach((item, idx) => {
          ws1.addRow(['', `${idx + 1}. ${item.description}`])
        })
      }
    }
    if (row.inspectionNotes) {
      ws1.addRow(['', row.inspectionNotes])
    }
    ws1.addRow([])

    // 三、材料查核
    ws1.addRow(['三、查核材料規格及品質（含約定之檢驗停留點、材料設備管制及檢（試）驗等抽驗情形）：'])
    const matLabel: Record<string, string> = {
      incoming: '【材料進場(取樣送驗)】',
      secondary: '【二級抽驗】',
      joint: '【材料會驗】',
    }
    for (const cat of ['incoming', 'secondary', 'joint'] as const) {
      const items = row.materialChecks.filter((i) => i.category === cat)
      ws1.addRow(['', matLabel[cat]])
      if (items.length === 0) {
        ws1.addRow(['', '無。'])
      } else {
        items.forEach((item, idx) => {
          const refStr = item.referenceNo ? `（編號:${item.referenceNo}）` : ''
          ws1.addRow(['', `${idx + 1}. ${item.description}${refStr}`])
        })
      }
    }
    if (row.materialQualityNotes) {
      ws1.addRow(['', row.materialQualityNotes])
    }
    ws1.addRow([])

    // 四、職安衛生
    ws1.addRow(['四、督導工地職業安全衛生事項：'])
    ws1.addRow([
      '',
      `（一）施工廠商施工前檢查事項辦理情形：${row.preWorkCheckCompleted ? '☑完成' : '☐未完成'}`,
    ])
    if (row.safetyNotes) {
      ws1.addRow(['', `（二）其他工地安全衛生督導事項：`])
      ws1.addRow(['', row.safetyNotes])
    }
    ws1.addRow([])

    // 五、其他
    ws1.addRow(['五、其他約定監造事項（含重要事項紀錄、主辦機關指示及通知廠商辦理事項等）：'])
    if (row.otherSupervisionNotes) {
      ws1.addRow(['', row.otherSupervisionNotes])
    }
    ws1.addRow([])

    ws1.addRow([
      '監造單位簽章：',
      row.supervisorSigned ? '（已簽章）' : '（未簽章）',
    ])

    // ===== Sheet 2：完成工程詳細表 =====
    const ws2 = workbook.addWorksheet('完成工程詳細表')
    ws2.columns = [
      { header: '項次', width: 20 },
      { header: '工程項目', width: 50 },
      { header: '單位', width: 8 },
      { header: '契約數量', width: 14 },
      { header: '本日完成數量', width: 14 },
      { header: '累計完成數量', width: 14 },
      { header: '備註', width: 20 },
    ]

    // 表頭
    const headerRow = ws2.getRow(1)
    headerRow.font = { bold: true }
    headerRow.alignment = { horizontal: 'center' }

    // 填入全部 PCCES 末層項目
    for (const leaf of allLeafItems) {
      const match = workItemByPccesId.get(leaf.id)
      const prior = priorMap.get(leaf.id) ?? new Prisma.Decimal(0)
      const dailyQty = match ? match.dailyCompletedQty : null
      const accumulatedQty = match
        ? match.accumulatedCompletedQty
        : prior.isZero()
          ? null
          : prior

      ws2.addRow([
        leaf.itemNo,
        leaf.description,
        leaf.unit,
        Number(leaf.quantity.toString()),
        dailyQty ? Number(dailyQty.toString()) : null,
        accumulatedQty ? Number(accumulatedQty.toString()) : null,
        match?.remark ?? '',
      ])
    }

    // 加入非 PCCES 綁定的手填工作項目
    const manualItems = row.workItems.filter((w) => !w.pccesItemId)
    for (const w of manualItems) {
      ws2.addRow([
        '',
        w.workItemName,
        w.unit,
        Number(w.contractQty.toString()),
        Number(w.dailyCompletedQty.toString()),
        Number(w.accumulatedCompletedQty.toString()),
        w.remark,
      ])
    }

    const buf = await workbook.xlsx.writeBuffer()
    return Buffer.from(buf)
  },
}
