import { Prisma } from '@prisma/client'
import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'
import { plannedCumulativeSeries } from './planned-cumulative-series.js'

function formatDateOnlyUtc(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** UTC 日曆天午夜 timestamp，供計畫生效日與填表日比較 */
function utcDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

export const projectProgressRepository = {
  async listPlans(projectId: string) {
    return prisma.progressPlan.findMany({
      where: { projectId, ...notDeleted },
      orderBy: { version: 'asc' },
      select: {
        id: true,
        version: true,
        label: true,
        isBaseline: true,
        effectiveFromDate: true,
        effectiveFromIdx: true,
        reason: true,
        extraWeeks: true,
        createdAt: true,
      },
    })
  },

  /** 儀表板多版本 S 曲線：含各期 entries（依 periodIndex 排序） */
  async listPlansWithEntries(projectId: string) {
    return prisma.progressPlan.findMany({
      where: { projectId, ...notDeleted },
      orderBy: { version: 'asc' },
      include: {
        entries: {
          where: { ...notDeleted },
          orderBy: { periodIndex: 'asc' },
        },
      },
    })
  },

  async findPlanById(projectId: string, planId: string) {
    return prisma.progressPlan.findFirst({
      where: { id: planId, projectId, ...notDeleted },
      include: {
        entries: {
          where: { ...notDeleted },
          orderBy: { periodIndex: 'asc' },
        },
      },
    })
  },

  async hasBaseline(projectId: string) {
    const n = await prisma.progressPlan.count({
      where: { projectId, isBaseline: true, ...notDeleted },
    })
    return n > 0
  },

  async maxVersion(projectId: string): Promise<number> {
    const agg = await prisma.progressPlan.aggregate({
      where: { projectId, ...notDeleted },
      _max: { version: true },
    })
    return agg._max.version ?? -1
  },

  async createPlan(
    data: {
      projectId: string
      version: number
      label: string
      reason: string | null
      isBaseline: boolean
      effectiveFromDate: Date
      effectiveFromIdx: number
      extraWeeks: number
      entries: Array<{
        periodDate: Date
        periodIndex: number
        periodProgress: Prisma.Decimal | null
        cumulativeProgress: Prisma.Decimal | null
        isLocked: boolean
        isExtended: boolean
      }>
    }
  ) {
    return prisma.progressPlan.create({
      data: {
        projectId: data.projectId,
        version: data.version,
        label: data.label,
        reason: data.reason,
        isBaseline: data.isBaseline,
        effectiveFromDate: data.effectiveFromDate,
        effectiveFromIdx: data.effectiveFromIdx,
        extraWeeks: data.extraWeeks,
        entries: {
          create: data.entries.map((e) => ({
            periodDate: e.periodDate,
            periodIndex: e.periodIndex,
            periodProgress: e.periodProgress,
            cumulativeProgress: e.cumulativeProgress,
            isLocked: e.isLocked,
            isExtended: e.isExtended,
          })),
        },
      },
      include: {
        entries: { orderBy: { periodIndex: 'asc' } },
      },
    })
  },

  async listActuals(projectId: string) {
    return prisma.progressActual.findMany({
      where: { projectId, ...notDeleted },
      orderBy: [{ periodIndex: 'asc' }, { periodDate: 'asc' }],
    })
  },

  /**
   * 施工日誌預定進度內插用：依**填表日**選擇已生效之進度計畫版本（`effectiveFromDate` ≤ 填表日曆天中，
   * 取生效日最新者，同生效日則取較高 `version`）；若填表日早於所有生效日，則取全專案中最早生效之計畫。
   * 回傳該版各期「時間區間＋累計預定 %」（與進度管理變更後之 Excel 累計一致）。
   */
  async getProgressPlanCumulativeKnotsForLogDate(
    projectId: string,
    logDate: Date
  ): Promise<Array<{ periodDate: string; cumulativePlanned: string }> | null> {
    const summaries = await prisma.progressPlan.findMany({
      where: { projectId, ...notDeleted },
      select: { id: true, version: true, effectiveFromDate: true },
    })
    if (!summaries.length) return null
    const logDay = utcDayMs(logDate)
    const eligible = summaries.filter((p) => utcDayMs(p.effectiveFromDate) <= logDay)
    let chosenId: string
    if (eligible.length > 0) {
      eligible.sort((a, b) => {
        const cmp = utcDayMs(b.effectiveFromDate) - utcDayMs(a.effectiveFromDate)
        if (cmp !== 0) return cmp
        return b.version - a.version
      })
      chosenId = eligible[0]!.id
    } else {
      const sorted = [...summaries].sort((a, b) => {
        const cmp = utcDayMs(a.effectiveFromDate) - utcDayMs(b.effectiveFromDate)
        if (cmp !== 0) return cmp
        return a.version - b.version
      })
      chosenId = sorted[0]!.id
    }

    const plan = await prisma.progressPlan.findFirst({
      where: { id: chosenId, projectId, ...notDeleted },
      include: {
        entries: { where: notDeleted, orderBy: { periodIndex: 'asc' } },
      },
    })
    if (!plan?.entries?.length) return null
    const cum = plannedCumulativeSeries(
      plan.entries.map((e) => ({
        periodProgress: e.periodProgress,
        cumulativeProgress: e.cumulativeProgress,
      }))
    )
    return plan.entries.map((e, i) => ({
      periodDate: formatDateOnlyUtc(e.periodDate),
      cumulativePlanned: cum[i] ?? '0',
    }))
  },

  /** 軟刪除計畫及其 entries（子列一併軟刪） */
  async softDeletePlanWithEntries(
    projectId: string,
    planId: string,
    deletedById: string
  ): Promise<boolean> {
    const existing = await prisma.progressPlan.findFirst({
      where: { id: planId, projectId, ...notDeleted },
      select: { id: true },
    })
    if (!existing) return false

    await prisma.$transaction([
      prisma.progressPlanEntry.updateMany({
        where: { planId, ...notDeleted },
        data: softDeleteSet(deletedById),
      }),
      prisma.progressPlan.updateMany({
        where: { id: planId, projectId, ...notDeleted },
        data: softDeleteSet(deletedById),
      }),
    ])
    return true
  },

  async countOtherActivePlans(projectId: string, excludePlanId: string): Promise<number> {
    return prisma.progressPlan.count({
      where: { projectId, ...notDeleted, id: { not: excludePlanId } },
    })
  },

  async upsertPlanEntry(
    planId: string,
    row: {
      periodDate: Date
      periodIndex: number
      periodProgress: Prisma.Decimal | null
      isLocked?: boolean
      isExtended?: boolean
    }
  ) {
    const existing = await prisma.progressPlanEntry.findFirst({
      where: { planId, periodDate: row.periodDate },
    })
    if (existing) {
      if (existing.deletedAt) {
        return prisma.progressPlanEntry.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            deletedById: null,
            periodIndex: row.periodIndex,
            periodProgress: row.periodProgress,
            isLocked: row.isLocked ?? existing.isLocked,
            isExtended: row.isExtended ?? existing.isExtended,
          },
        })
      }
      return prisma.progressPlanEntry.update({
        where: { id: existing.id },
        data: {
          periodIndex: row.periodIndex,
          periodProgress: row.periodProgress,
          isLocked: row.isLocked ?? existing.isLocked,
          isExtended: row.isExtended ?? existing.isExtended,
        },
      })
    }
    return prisma.progressPlanEntry.create({
      data: {
        planId,
        periodDate: row.periodDate,
        periodIndex: row.periodIndex,
        periodProgress: row.periodProgress,
        isLocked: row.isLocked ?? false,
        isExtended: row.isExtended ?? false,
      },
    })
  },

  async upsertActual(
    projectId: string,
    row: {
      periodDate: Date
      periodIndex: number
      periodProgressPercent: Prisma.Decimal | null
      /** 未傳則不覆寫既有累計實際（相容舊客戶端） */
      cumulativeProgressPercent?: Prisma.Decimal | null
    }
  ) {
    const cumPatch =
      row.cumulativeProgressPercent === undefined
        ? {}
        : { cumulativeProgressPercent: row.cumulativeProgressPercent }
    const existing = await prisma.progressActual.findFirst({
      where: { projectId, periodDate: row.periodDate },
    })
    if (existing) {
      if (existing.deletedAt) {
        return prisma.progressActual.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            deletedById: null,
            periodIndex: row.periodIndex,
            periodProgressPercent: row.periodProgressPercent,
            source: 'manual',
            ...cumPatch,
          },
        })
      }
      return prisma.progressActual.update({
        where: { id: existing.id },
        data: {
          periodIndex: row.periodIndex,
          periodProgressPercent: row.periodProgressPercent,
          source: 'manual',
          ...cumPatch,
        },
      })
    }
    return prisma.progressActual.create({
      data: {
        projectId,
        periodDate: row.periodDate,
        periodIndex: row.periodIndex,
        periodProgressPercent: row.periodProgressPercent,
        cumulativeProgressPercent:
          row.cumulativeProgressPercent === undefined ? null : row.cumulativeProgressPercent,
        source: 'manual',
      },
    })
  },
}

export function toDecimalOrNull(n: number | null | undefined): Prisma.Decimal | null {
  if (n === null || n === undefined) return null
  return new Prisma.Decimal(n)
}
