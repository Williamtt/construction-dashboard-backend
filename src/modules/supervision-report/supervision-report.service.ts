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
        contractNo: true,
        ownerAgency: true,
        startDate: true,
        plannedDurationDays: true,
        plannedEndDate: true,
        revisedEndDate: true,
        originalContractAmount: true,
        designFee: true,
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

    // 預定完工日期：revisedEndDate > plannedEndDate > 開工+工期 on-the-fly 計算
    let plannedCompletionDate: string | null = null
    if (p.revisedEndDate) {
      plannedCompletionDate = formatDateOnlyUtc(p.revisedEndDate)
    } else if (p.plannedEndDate) {
      plannedCompletionDate = formatDateOnlyUtc(p.plannedEndDate)
    } else if (p.startDate && p.plannedDurationDays) {
      const d = new Date(p.startDate)
      d.setUTCDate(d.getUTCDate() + p.plannedDurationDays)
      plannedCompletionDate = formatDateOnlyUtc(d)
    }

    // 契約總價 = 原契約工程費 + 原契約設計相關費
    const originalAmount = p.originalContractAmount
    const designFeeAmount = p.designFee
    const contractTotalAmount =
      originalAmount != null && designFeeAmount != null
        ? originalAmount.add(designFeeAmount).toString()
        : originalAmount?.toString() ?? null

    return {
      projectName: p.name,
      contractorName: p.contractor ?? '',
      supervisionUnit: p.supervisionUnit ?? '',
      contractNo: p.contractNo ?? '',
      ownerAgency: p.ownerAgency ?? '',
      startDate: p.startDate ? formatDateOnlyUtc(p.startDate) : null,
      contractDuration: p.plannedDurationDays ?? null,
      plannedCompletionDate,
      extensionDays: extensionSum._sum.approvedDays ?? 0,
      contractChangeCount: Math.max(0, pccesCount - 1),
      constructionPlannedProgress,
      originalContractAmount: originalAmount?.toString() ?? null,
      designFee: designFeeAmount?.toString() ?? null,
      contractTotal: contractTotalAmount,
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
   * 匯出 Excel：第1頁依公共工程監造日報表官方格式；第2頁完成工程詳細表
   */
  async exportExcel(projectId: string, reportId: string, user: AuthUser): Promise<Buffer> {
    await assertProjectModuleAction(user, projectId, 'construction.supervision', 'read')
    const row = await supervisionReportRepository.findByIdForProject(projectId, reportId)
    if (!row) throw new AppError(404, 'NOT_FOUND', '找不到監造報表')

    // 取得專案資料（監造單位、契約編號、主辦機關）
    const proj = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { supervisionUnit: true, contractNo: true, ownerAgency: true },
    })

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

    // ===== Sheet 1：公共工程監造日報表（官方格式） =====
    const ws1 = workbook.addWorksheet('公共工程監造日報表')
    // 12 欄，對應 A~L
    ws1.columns = [
      { width: 12 }, // A
      { width: 16 }, // B
      { width: 8  }, // C
      { width: 12 }, // D
      { width: 8  }, // E
      { width: 10 }, // F
      { width: 12 }, // G
      { width: 14 }, // H
      { width: 12 }, // I
      { width: 10 }, // J
      { width: 12 }, // K
      { width: 10 }, // L
    ]

    // 民國年日期格式
    function toROCDate(isoDate: string | null | undefined): string {
      if (!isoDate) return ''
      const d = new Date(isoDate + 'T12:00:00.000Z')
      if (Number.isNaN(d.getTime())) return isoDate
      const y = d.getUTCFullYear() - 1911
      const m = d.getUTCMonth() + 1
      const day = d.getUTCDate()
      return `${y}年${m}月${day}日`
    }

    // 輔助：設定儲存格值並加外框
    function setCell(
      ws: typeof ws1,
      rowNum: number,
      col: number,
      value: unknown,
      opts?: { bold?: boolean; wrapText?: boolean; align?: 'left' | 'center' | 'right' }
    ) {
      const cell = ws.getRow(rowNum).getCell(col)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cell.value = value as any
      if (opts?.bold) cell.font = { bold: true }
      if (opts?.wrapText || opts?.align) {
        cell.alignment = {
          wrapText: opts.wrapText ?? false,
          vertical: 'top',
          horizontal: opts.align ?? 'left',
        }
      }
    }

    // 輔助：套用全格外框
    function applyBorder(ws: typeof ws1, startRow: number, endRow: number, startCol: number, endCol: number) {
      const thin = { style: 'thin' as const }
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          const cell = ws.getRow(r).getCell(c)
          cell.border = {
            top: thin,
            left: thin,
            bottom: thin,
            right: thin,
          }
        }
      }
    }

    let r = 1 // 目前列號

    // ── 第1列：監造公司名稱 ──
    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, proj?.supervisionUnit ?? '', { bold: true, align: 'center' })
    ws1.getRow(r).height = 20
    r++

    // ── 第2列：第一聯 ｜ 公共工程監造日報表 ──
    setCell(ws1, r, 1, '第一聯')
    ws1.mergeCells(r, 2, r, 12)
    setCell(ws1, r, 2, '公共工程監造日報表', { bold: true, align: 'center' })
    ws1.getRow(r).height = 22
    r++

    // ── 第3列：天氣 + 填報日期 ──
    const reportDateROC = toROCDate(formatDateOnlyUtc(row.reportDate))
    setCell(ws1, r, 1, '本日天氣:上午')
    setCell(ws1, r, 2, row.weatherAm ?? '')
    setCell(ws1, r, 3, '下午')
    setCell(ws1, r, 4, row.weatherPm ?? '')
    ws1.mergeCells(r, 7, r, 8)
    setCell(ws1, r, 7, '填報日期:')
    ws1.mergeCells(r, 9, r, 11)
    setCell(ws1, r, 9, reportDateROC)
    applyBorder(ws1, r, r, 1, 12)
    r++

    // ── 第4列：工程名稱 + 契約編號 ──
    setCell(ws1, r, 1, '工程名稱')
    ws1.mergeCells(r, 2, r, 8)
    setCell(ws1, r, 2, row.projectName)
    ws1.mergeCells(r, 9, r, 10)
    setCell(ws1, r, 9, '契約編號')
    ws1.mergeCells(r, 11, r, 12)
    setCell(ws1, r, 11, proj?.contractNo ?? '')
    applyBorder(ws1, r, r, 1, 12)
    r++

    // ── 第5列：主辦機關 + 契約工期 + 開工日期 + 預定竣工 + 實際竣工 ──
    setCell(ws1, r, 1, '主辦機關')
    ws1.mergeCells(r, 2, r, 3)
    setCell(ws1, r, 2, proj?.ownerAgency ?? '')
    setCell(ws1, r, 4, '契約工期(註3)')
    setCell(ws1, r, 5, row.contractDuration ?? '')
    setCell(ws1, r, 6, '開工日期')
    setCell(ws1, r, 7, row.startDate ? toROCDate(formatDateOnlyUtc(row.startDate)) : '')
    setCell(ws1, r, 8, '預定竣工日期(註3)')
    ws1.mergeCells(r, 9, r, 10)
    setCell(ws1, r, 9, row.plannedCompletionDate ? toROCDate(formatDateOnlyUtc(row.plannedCompletionDate)) : '')
    setCell(ws1, r, 11, '實際竣工日期')
    setCell(ws1, r, 12, row.actualCompletionDate ? toROCDate(formatDateOnlyUtc(row.actualCompletionDate)) : '')
    applyBorder(ws1, r, r, 1, 12)
    r++

    // ── 第6列：空行 ──
    r++

    // ── 第7列：契約變更次數 + 工期展延 + 契約金額（原契約） ──
    ws1.mergeCells(r, 1, r, 2)
    setCell(ws1, r, 1, '契約變更次數(註4)')
    setCell(ws1, r, 3, row.contractChangeCount ?? '')
    ws1.mergeCells(r, 5, r, 7)
    setCell(ws1, r, 5, '工期展延天數')
    setCell(ws1, r, 8, '契約金額')
    setCell(ws1, r, 9, '原契約：')
    ws1.mergeCells(r, 11, r, 12)
    setCell(ws1, r, 11, serializeDecimal(row.originalContractAmount) ? Number(serializeDecimal(row.originalContractAmount)) : '')
    applyBorder(ws1, r, r, 1, 12)
    r++

    // ── 第8列：預定進度 + 實際進度 + 變更後契約 ──
    ws1.mergeCells(r, 1, r, 4)
    setCell(ws1, r, 1, '預定進度(%)(註5)')
    const plannedProg = serializeDecimal(row.constructionPlannedProgress)
    ws1.mergeCells(r, 5, r, 7)
    setCell(ws1, r, 5, plannedProg ? Number(plannedProg) : '')
    ws1.mergeCells(r, 8, r, 10)
    setCell(ws1, r, 8, '實際進度(%)\n(註5)', { wrapText: true })
    const actualProg = serializeDecimal(row.constructionActualProgress)
    // 實際進度值：暫借 L 欄顯示（與原契約同欄）
    setCell(ws1, r, 9, '變更後契約：')
    ws1.mergeCells(r, 11, r, 12)
    setCell(ws1, r, 11, serializeDecimal(row.contractTotal) ? Number(serializeDecimal(row.contractTotal)) : '')
    applyBorder(ws1, r, r, 1, 12)
    r++

    // ── 第9列：實際進度值補行 ──
    ws1.mergeCells(r, 1, r, 4)
    setCell(ws1, r, 1, '實際進度(%)(註5)')
    ws1.mergeCells(r, 5, r, 7)
    setCell(ws1, r, 5, actualProg ? Number(actualProg) : '')
    applyBorder(ws1, r, r, 1, 8)
    r++

    // ── 空行 ──
    r++

    // ── 一、工程進行情況 ──
    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, '一、工程進行情況（含約定之重要施工項目及數量）：', { bold: true })
    applyBorder(ws1, r, r, 1, 12)
    r++

    // 工項表頭
    const wiHeaderRow = r
    setCell(ws1, r, 1, '工程項目', { bold: true, align: 'center' })
    ws1.mergeCells(r, 1, r, 5)
    setCell(ws1, r, 6, '單位', { bold: true, align: 'center' })
    setCell(ws1, r, 7, '契約數量', { bold: true, align: 'center' })
    ws1.mergeCells(r, 7, r, 8)
    setCell(ws1, r, 9, '本日完成數量', { bold: true, align: 'center' })
    ws1.mergeCells(r, 9, r, 10)
    setCell(ws1, r, 11, '累計完成數量', { bold: true, align: 'center' })
    ws1.mergeCells(r, 11, r, 12)
    applyBorder(ws1, r, r, 1, 12)
    r++

    for (const w of row.workItems) {
      ws1.mergeCells(r, 1, r, 5)
      setCell(ws1, r, 1, w.workItemName, { wrapText: true })
      setCell(ws1, r, 6, w.unit, { align: 'center' })
      ws1.mergeCells(r, 7, r, 8)
      setCell(ws1, r, 7, w.contractQty ? Number(w.contractQty.toString()) : '', { align: 'right' })
      ws1.mergeCells(r, 9, r, 10)
      setCell(ws1, r, 9, w.dailyCompletedQty ? Number(w.dailyCompletedQty.toString()) : '', { align: 'right' })
      ws1.mergeCells(r, 11, r, 12)
      setCell(ws1, r, 11, w.accumulatedCompletedQty ? Number(w.accumulatedCompletedQty.toString()) : '', { align: 'right' })
      applyBorder(ws1, r, r, 1, 12)
      r++
    }
    // 若無工項，至少留一空行
    if (row.workItems.length === 0) {
      ws1.mergeCells(r, 1, r, 12)
      applyBorder(ws1, r, r, 1, 12)
      r++
    }

    // 本日重要工作（工項名稱彙整）
    const importantWork = row.workItems.map((w) => w.workItemName).join('\n')
    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, importantWork ? `本日重要工作：${importantWork}` : '本日重要工作：', { wrapText: true })
    ws1.getRow(r).height = Math.max(30, 15 * Math.max(1, row.workItems.length))
    applyBorder(ws1, r, r, 1, 12)
    r++

    // ── 空行 ──
    r++

    // ── 二、監督施工查驗 ──
    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, '二、監督依設計圖說及核定施工圖說施工（含約定之檢驗停留點及施工抽查等情形）：', { bold: true })
    applyBorder(ws1, r, r, 1, 12)
    r++

    const categoryLabel: Record<string, string> = {
      random_check: '【施工不定期抽查】',
      civil: '【土建施工查驗】',
      mep: '【機電施工查驗】',
      deficiency: '【施工不合格缺失】',
    }
    const insp2Start = r
    for (const cat of ['random_check', 'civil', 'mep', 'deficiency'] as const) {
      const items = row.inspections.filter((i) => i.category === cat)
      if (items.length === 0) continue
      ws1.mergeCells(r, 1, r, 12)
      setCell(ws1, r, 1, categoryLabel[cat], { bold: true })
      r++
      for (const item of items) {
        ws1.mergeCells(r, 1, r, 12)
        setCell(ws1, r, 1, item.description, { wrapText: true })
        r++
      }
    }
    if (row.inspectionNotes) {
      ws1.mergeCells(r, 1, r, 12)
      setCell(ws1, r, 1, row.inspectionNotes, { wrapText: true })
      r++
    }
    // 若二節為空，留一空行
    if (r === insp2Start) {
      ws1.mergeCells(r, 1, r, 12)
      r++
    }
    applyBorder(ws1, insp2Start, r - 1, 1, 12)

    r++

    // ── 三、材料查核 ──
    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, '三、查核材料規格及品質（含約定之檢驗停留點、材料設備管制及檢（試）驗等抽驗情形）：', { bold: true })
    applyBorder(ws1, r, r, 1, 12)
    r++

    // 材料表頭
    ws1.mergeCells(r, 1, r, 2)
    setCell(ws1, r, 1, '本日取（抽）樣材料項目', { bold: true, align: 'center' })
    ws1.mergeCells(r, 3, r, 5)
    setCell(ws1, r, 3, '取（抽）樣位置', { bold: true, align: 'center' })
    ws1.mergeCells(r, 6, r, 7)
    setCell(ws1, r, 6, '代表數量', { bold: true, align: 'center' })
    setCell(ws1, r, 8, '試樣數量', { bold: true, align: 'center' })
    ws1.mergeCells(r, 9, r, 10)
    setCell(ws1, r, 9, '設計強度', { bold: true, align: 'center' })
    ws1.mergeCells(r, 11, r, 12)
    setCell(ws1, r, 11, '備註(含試樣編號)', { bold: true, align: 'center' })
    applyBorder(ws1, r, r, 1, 12)
    r++

    const matLabel: Record<string, string> = {
      incoming: '【材料進場(取樣送驗)】',
      secondary: '【二級抽驗】',
      joint: '【材料會驗】',
    }
    const mat3Start = r
    for (const cat of ['incoming', 'secondary', 'joint'] as const) {
      const items = row.materialChecks.filter((i) => i.category === cat)
      if (items.length === 0) continue
      ws1.mergeCells(r, 1, r, 12)
      setCell(ws1, r, 1, matLabel[cat], { bold: true })
      applyBorder(ws1, r, r, 1, 12)
      r++
      for (const item of items) {
        ws1.mergeCells(r, 1, r, 2)
        setCell(ws1, r, 1, item.description, { wrapText: true })
        // 取樣位置、代表數量、試樣數量、設計強度 留空
        ws1.mergeCells(r, 3, r, 5)
        ws1.mergeCells(r, 6, r, 7)
        ws1.mergeCells(r, 9, r, 10)
        ws1.mergeCells(r, 11, r, 12)
        setCell(ws1, r, 11, item.referenceNo ?? '')
        applyBorder(ws1, r, r, 1, 12)
        r++
      }
    }
    if (row.materialQualityNotes) {
      ws1.mergeCells(r, 1, r, 12)
      setCell(ws1, r, 1, row.materialQualityNotes, { wrapText: true })
      applyBorder(ws1, r, r, 1, 12)
      r++
    }
    // 若三節為空，留一空行
    if (r === mat3Start) {
      ws1.mergeCells(r, 1, r, 12)
      applyBorder(ws1, r, r, 1, 12)
      r++
    }

    r++

    // ── 四、職業安全衛生督導 ──
    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, '四、督導工地職業安全衛生事項：', { bold: true })
    applyBorder(ws1, r, r, 1, 12)
    r++

    ws1.mergeCells(r, 1, r, 7)
    setCell(ws1, r, 1, '（一）施工廠商施工前檢查事項辦理情形：')
    ws1.mergeCells(r, 8, r, 10)
    setCell(ws1, r, 8, row.preWorkCheckCompleted ? '■完成' : '□完成', { align: 'center' })
    ws1.mergeCells(r, 11, r, 12)
    setCell(ws1, r, 11, row.preWorkCheckCompleted ? '□未完成' : '■未完成', { align: 'center' })
    applyBorder(ws1, r, r, 1, 12)
    r++

    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, '（二）其他工地安全衛生督導事項：')
    applyBorder(ws1, r, r, 1, 12)
    r++

    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, row.safetyNotes ?? '', { wrapText: true })
    ws1.getRow(r).height = row.safetyNotes ? Math.max(30, 15 * (row.safetyNotes.split('\n').length)) : 30
    applyBorder(ws1, r, r, 1, 12)
    r++

    r++

    // ── 五、其他約定監造事項 ──
    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, '五、其他約定監造事項（含重要事項紀錄、主辦機關指示及通知廠商辦理事項等）：', { bold: true })
    applyBorder(ws1, r, r, 1, 12)
    r++

    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1, row.otherSupervisionNotes ?? '', { wrapText: true })
    ws1.getRow(r).height = row.otherSupervisionNotes ? Math.max(30, 15 * (row.otherSupervisionNotes.split('\n').length)) : 30
    applyBorder(ws1, r, r, 1, 12)
    r++

    r++

    // ── 監造單位簽章 ──
    ws1.mergeCells(r, 1, r, 4)
    setCell(ws1, r, 1, '監造單位簽章：')
    ws1.mergeCells(r, 5, r, 12)
    setCell(ws1, r, 5, row.supervisorSigned ? '（已簽章）' : '')
    applyBorder(ws1, r, r, 1, 12)
    r++

    r++

    // ── 法規注記 ──
    ws1.mergeCells(r, 1, r, 12)
    setCell(ws1, r, 1,
      '註：1. 本表分為二聯，各機關得依業務需要訂定填報份數，一份留存監造單位隨時備查，一份併估驗詳細表送核。\n' +
      '2.本表原則應按日填寫，機關另有規定者，從其規定；若屬委外監造之工程，則一律按日填寫。\n' +
      '3.如已完成辦理契約變更或工期展延，應填寫修正核定後之契約工期與預定竣工日期。\n' +
      '4.契約變更次數應依「修正契約總價表」內容填寫。\n' +
      '5.預定進度與實際進度應於每周六及月底估計填寫一次。\n' +
      '6.各機關得依契約約定事項及參酌業務性質，調整訂定監督項目。\n' +
      '7.本表不得塗改。',
      { wrapText: true }
    )
    ws1.getRow(r).height = 90

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

    const headerRow = ws2.getRow(1)
    headerRow.font = { bold: true }
    headerRow.alignment = { horizontal: 'center' }

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
