import type { SupervisionReport } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'
import type { SupervisionReportCreateInput } from '../../schemas/supervision-report.js'
import {
  collectLineageItemsByItemKeys,
  mapLatestApprovedPccesItemIdsToItemKeys,
} from '../pcces-import/pcces-item-lineage.js'

function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return new Date(NaN)
  return new Date(Date.UTC(y, m - 1, d))
}

export const supervisionReportRepository = {
  async findDuplicateReportDate(
    projectId: string,
    reportDate: Date,
    excludeId?: string
  ): Promise<boolean> {
    const row = await prisma.supervisionReport.findFirst({
      where: {
        projectId,
        reportDate,
        ...notDeleted,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    })
    return row != null
  },

  async listByProject(
    projectId: string,
    args: { skip: number; take: number }
  ): Promise<{ rows: SupervisionReport[]; total: number }> {
    const where = { projectId, ...notDeleted }
    const [total, rows] = await Promise.all([
      prisma.supervisionReport.count({ where }),
      prisma.supervisionReport.findMany({
        where,
        orderBy: { reportDate: 'desc' },
        skip: args.skip,
        take: args.take,
      }),
    ])
    return { rows, total }
  },

  async findByIdForProject(projectId: string, reportId: string) {
    return prisma.supervisionReport.findFirst({
      where: { id: reportId, projectId, ...notDeleted },
      include: {
        inspections: { orderBy: { sortOrder: 'asc' } },
        materialChecks: { orderBy: { sortOrder: 'asc' } },
        workItems: {
          orderBy: { sortOrder: 'asc' },
          include: {
            pccesItem: { select: { itemNo: true, itemKind: true, itemKey: true, importId: true } },
          },
        },
      },
    })
  },

  async create(projectId: string, userId: string, body: SupervisionReportCreateInput): Promise<string> {
    const reportDate = parseDateOnly(body.reportDate)
    const startDate = body.startDate ? parseDateOnly(body.startDate) : null
    const plannedCompletionDate = body.plannedCompletionDate
      ? parseDateOnly(body.plannedCompletionDate)
      : null
    const actualCompletionDate = body.actualCompletionDate
      ? parseDateOnly(body.actualCompletionDate)
      : null

    const created = await prisma.$transaction(async (tx) => {
      const report = await tx.supervisionReport.create({
        data: {
          projectId,
          createdById: userId,
          reportNo: body.reportNo ?? null,
          weatherAm: body.weatherAm ?? null,
          weatherPm: body.weatherPm ?? null,
          reportDate,
          projectName: body.projectName,
          contractDuration: body.contractDuration ?? null,
          startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
          plannedCompletionDate:
            plannedCompletionDate && !Number.isNaN(plannedCompletionDate.getTime())
              ? plannedCompletionDate
              : null,
          actualCompletionDate:
            actualCompletionDate && !Number.isNaN(actualCompletionDate.getTime())
              ? actualCompletionDate
              : null,
          contractChangeCount: body.contractChangeCount ?? null,
          extensionDays: body.extensionDays ?? null,
          originalContractAmount:
            body.originalContractAmount !== undefined ? body.originalContractAmount : null,
          designFee: body.designFee !== undefined ? body.designFee : null,
          contractTotal: body.contractTotal !== undefined ? body.contractTotal : null,
          constructionPlannedProgress:
            body.constructionPlannedProgress != null
              ? String(body.constructionPlannedProgress)
              : null,
          constructionActualProgress:
            body.constructionActualProgress != null
              ? String(body.constructionActualProgress)
              : null,
          overallPlannedProgress:
            body.overallPlannedProgress != null ? String(body.overallPlannedProgress) : null,
          overallActualProgress:
            body.overallActualProgress != null ? String(body.overallActualProgress) : null,
          inspectionNotes: body.inspectionNotes,
          materialQualityNotes: body.materialQualityNotes,
          preWorkCheckCompleted: body.preWorkCheckCompleted,
          safetyNotes: body.safetyNotes,
          otherSupervisionNotes: body.otherSupervisionNotes,
          supervisorSigned: body.supervisorSigned,
        },
      })

      if (body.inspections.length > 0) {
        await tx.supervisionReportInspection.createMany({
          data: body.inspections.map((item, i) => ({
            reportId: report.id,
            sortOrder: i,
            category: item.category,
            description: item.description,
          })),
        })
      }

      if (body.materialChecks.length > 0) {
        await tx.supervisionReportMaterialCheck.createMany({
          data: body.materialChecks.map((item, i) => ({
            reportId: report.id,
            sortOrder: i,
            category: item.category,
            description: item.description,
            referenceNo: item.referenceNo,
          })),
        })
      }

      if (body.workItems.length > 0) {
        await tx.supervisionReportWorkItem.createMany({
          data: body.workItems.map((w, i) => ({
            reportId: report.id,
            sortOrder: i,
            pccesItemId: w.pccesItemId ?? null,
            workItemName: w.workItemName,
            unit: w.unit,
            contractQty: w.contractQty,
            dailyCompletedQty: w.dailyCompletedQty,
            accumulatedCompletedQty: w.accumulatedCompletedQty,
            remark: w.remark,
          })),
        })
      }

      return report
    })

    return created.id
  },

  async update(projectId: string, reportId: string, body: SupervisionReportCreateInput): Promise<boolean> {
    const existing = await prisma.supervisionReport.findFirst({
      where: { id: reportId, projectId, ...notDeleted },
      select: { id: true },
    })
    if (!existing) return false

    const reportDate = parseDateOnly(body.reportDate)
    const startDate = body.startDate ? parseDateOnly(body.startDate) : null
    const plannedCompletionDate = body.plannedCompletionDate
      ? parseDateOnly(body.plannedCompletionDate)
      : null
    const actualCompletionDate = body.actualCompletionDate
      ? parseDateOnly(body.actualCompletionDate)
      : null

    await prisma.$transaction(async (tx) => {
      await tx.supervisionReportInspection.deleteMany({ where: { reportId } })
      await tx.supervisionReportMaterialCheck.deleteMany({ where: { reportId } })
      await tx.supervisionReportWorkItem.deleteMany({ where: { reportId } })

      await tx.supervisionReport.update({
        where: { id: reportId },
        data: {
          reportNo: body.reportNo ?? null,
          weatherAm: body.weatherAm ?? null,
          weatherPm: body.weatherPm ?? null,
          reportDate,
          projectName: body.projectName,
          contractDuration: body.contractDuration ?? null,
          startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null,
          plannedCompletionDate:
            plannedCompletionDate && !Number.isNaN(plannedCompletionDate.getTime())
              ? plannedCompletionDate
              : null,
          actualCompletionDate:
            actualCompletionDate && !Number.isNaN(actualCompletionDate.getTime())
              ? actualCompletionDate
              : null,
          contractChangeCount: body.contractChangeCount ?? null,
          extensionDays: body.extensionDays ?? null,
          originalContractAmount:
            body.originalContractAmount !== undefined ? body.originalContractAmount : null,
          designFee: body.designFee !== undefined ? body.designFee : null,
          contractTotal: body.contractTotal !== undefined ? body.contractTotal : null,
          constructionPlannedProgress:
            body.constructionPlannedProgress != null
              ? String(body.constructionPlannedProgress)
              : null,
          constructionActualProgress:
            body.constructionActualProgress != null
              ? String(body.constructionActualProgress)
              : null,
          overallPlannedProgress:
            body.overallPlannedProgress != null ? String(body.overallPlannedProgress) : null,
          overallActualProgress:
            body.overallActualProgress != null ? String(body.overallActualProgress) : null,
          inspectionNotes: body.inspectionNotes,
          materialQualityNotes: body.materialQualityNotes,
          preWorkCheckCompleted: body.preWorkCheckCompleted,
          safetyNotes: body.safetyNotes,
          otherSupervisionNotes: body.otherSupervisionNotes,
          supervisorSigned: body.supervisorSigned,
        },
      })

      if (body.inspections.length > 0) {
        await tx.supervisionReportInspection.createMany({
          data: body.inspections.map((item, i) => ({
            reportId,
            sortOrder: i,
            category: item.category,
            description: item.description,
          })),
        })
      }

      if (body.materialChecks.length > 0) {
        await tx.supervisionReportMaterialCheck.createMany({
          data: body.materialChecks.map((item, i) => ({
            reportId,
            sortOrder: i,
            category: item.category,
            description: item.description,
            referenceNo: item.referenceNo,
          })),
        })
      }

      if (body.workItems.length > 0) {
        await tx.supervisionReportWorkItem.createMany({
          data: body.workItems.map((w, i) => ({
            reportId,
            sortOrder: i,
            pccesItemId: w.pccesItemId ?? null,
            workItemName: w.workItemName,
            unit: w.unit,
            contractQty: w.contractQty,
            dailyCompletedQty: w.dailyCompletedQty,
            accumulatedCompletedQty: w.accumulatedCompletedQty,
            remark: w.remark,
          })),
        })
      }
    })

    return true
  },

  /**
   * 填報日期早於 reportDate 之 dailyCompletedQty 加總，依 itemKey 跨已核定 PCCES 版。
   * `pccesItemIds` 須為「目前最新核定版」之工項 id；回傳鍵為該 id。
   * excludeReportId：更新報表時排除自身。
   */
  async sumDailyQtyByPccesItemsBeforeReportDate(
    projectId: string,
    pccesItemIds: string[],
    reportDate: Date,
    excludeReportId?: string
  ): Promise<Map<string, Prisma.Decimal>> {
    const map = new Map<string, Prisma.Decimal>()
    for (const id of pccesItemIds) {
      map.set(id, new Prisma.Decimal(0))
    }
    if (pccesItemIds.length === 0) return map

    const latestIdToKey = await mapLatestApprovedPccesItemIdsToItemKeys(projectId, pccesItemIds)
    const itemKeys = [...new Set(latestIdToKey.values())]
    if (itemKeys.length === 0) return map

    const { lineageIds, lineageIdToItemKey } = await collectLineageItemsByItemKeys(
      projectId,
      itemKeys
    )
    if (lineageIds.length === 0) return map

    const groups = await prisma.supervisionReportWorkItem.groupBy({
      by: ['pccesItemId'],
      where: {
        pccesItemId: { in: lineageIds },
        report: {
          projectId,
          ...notDeleted,
          ...(excludeReportId ? { id: { not: excludeReportId } } : {}),
          reportDate: { lt: reportDate },
        },
      },
      _sum: { dailyCompletedQty: true },
    })

    const sumByItemKey = new Map<number, Prisma.Decimal>()
    for (const g of groups) {
      if (!g.pccesItemId) continue
      const key = lineageIdToItemKey.get(g.pccesItemId)
      if (key === undefined) continue
      const add = g._sum.dailyCompletedQty ?? new Prisma.Decimal(0)
      sumByItemKey.set(key, (sumByItemKey.get(key) ?? new Prisma.Decimal(0)).plus(add))
    }

    for (const id of pccesItemIds) {
      const key = latestIdToKey.get(id)
      if (key === undefined) continue
      map.set(id, sumByItemKey.get(key) ?? new Prisma.Decimal(0))
    }
    return map
  },

  /**
   * 查詢指定日期的施工日誌（含工項），用於預填監造報表。
   * 若同日有多筆，取最近更新的一筆。
   */
  async findDailyLogByDate(projectId: string, logDate: Date) {
    return prisma.constructionDailyLog.findFirst({
      where: { projectId, logDate, ...notDeleted },
      orderBy: { updatedAt: 'desc' },
      include: {
        workItems: { orderBy: { sortOrder: 'asc' } },
      },
    })
  },

  /** 查詢專案所有監造報表的施工實際進度，供進度表 dashboard 參考欄位使用。 */
  async listConstructionProgressByProject(projectId: string) {
    return prisma.supervisionReport.findMany({
      where: { projectId, ...notDeleted },
      select: { reportDate: true, constructionActualProgress: true },
      orderBy: { reportDate: 'asc' },
    })
  },

  async softDelete(projectId: string, reportId: string, deletedById: string): Promise<boolean> {
    const existing = await prisma.supervisionReport.findFirst({
      where: { id: reportId, projectId, ...notDeleted },
      select: { id: true },
    })
    if (!existing) return false

    await prisma.supervisionReport.update({
      where: { id: reportId },
      data: softDeleteSet(deletedById),
    })
    return true
  },
}
