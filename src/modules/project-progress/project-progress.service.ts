import fs from 'node:fs/promises'
import { Prisma } from '@prisma/client'
import { AppError } from '../../shared/errors.js'
import { prisma } from '../../lib/db.js'
import { progressPlanExcelTemplateAbsPath } from '../../lib/resource-paths.js'
import { notDeleted } from '../../shared/soft-delete.js'
import { FILE_CATEGORY_PROGRESS_PLAN_IMPORT } from '../../constants/file.js'
import { assertProjectModuleAction } from '../project-permission/project-permission.service.js'
import type { AuthUser } from '../../shared/project-access.js'
import { assertCanAccessProject } from '../../shared/project-access.js'
import {
  progressPlanCreateSchema,
  progressPlanDuplicateSchema,
  progressPlanEntriesPutSchema,
  progressPlanEffectivePatchSchema,
  progressActualsPutSchema,
} from '../../schemas/project-progress.js'
import { fileRepository } from '../file/file.repository.js'
import {
  projectProgressRepository,
  toDecimalOrNull,
} from './project-progress.repository.js'
import { plannedCumulativeSeries } from './planned-cumulative-series.js'

function formatDateOnlyUtc(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function decStr(d: Prisma.Decimal | null | undefined): string | null {
  if (d === null || d === undefined) return null
  return d.toString()
}

function parseBodyDate(s: string): Date {
  return new Date(`${s}T12:00:00.000Z`)
}

export const projectProgressService = {
  async getDashboard(
    projectId: string,
    user: AuthUser,
    primaryPlanId: string | undefined,
    comparePlanId: string | undefined
  ) {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'read')

    const plans = await projectProgressRepository.listPlans(projectId)
    const planDtos = plans.map((p) => ({
      id: p.id,
      version: p.version,
      label: p.label,
      isBaseline: p.isBaseline,
      effectiveFromDate: formatDateOnlyUtc(p.effectiveFromDate),
      effectiveFromIdx: p.effectiveFromIdx,
      reason: p.reason,
      extraWeeks: p.extraWeeks,
    }))

    let primaryId = primaryPlanId
    if (!primaryId) {
      const baseline = plans.find((p) => p.isBaseline)
      primaryId = baseline?.id ?? plans[plans.length - 1]?.id
    }

    const primary =
      primaryId != null
        ? await projectProgressRepository.findPlanById(projectId, primaryId)
        : null
    if (primaryId && !primary) {
      throw new AppError(404, 'NOT_FOUND', '找不到主要計畫版本')
    }

    let compare = null as Awaited<ReturnType<typeof projectProgressRepository.findPlanById>>
    if (comparePlanId && comparePlanId !== primaryId) {
      compare = await projectProgressRepository.findPlanById(projectId, comparePlanId)
      if (!compare) throw new AppError(404, 'NOT_FOUND', '找不到比較計畫版本')
    }

    const actualRows = await projectProgressRepository.listActuals(projectId)
    const actualByDate = new Map<string, (typeof actualRows)[0]>()
    for (const a of actualRows) {
      actualByDate.set(formatDateOnlyUtc(a.periodDate), a)
    }

    const primaryEntries = primary?.entries ?? []
    const compareByDate = new Map<string, (typeof primaryEntries)[0]>()
    if (compare) {
      for (const e of compare.entries) {
        compareByDate.set(formatDateOnlyUtc(e.periodDate), e)
      }
    }

    const periodDates = primaryEntries.map((e) => formatDateOnlyUtc(e.periodDate))

    const cumPrimary = plannedCumulativeSeries(
      primaryEntries.map((e) => ({
        periodProgress: e.periodProgress,
        cumulativeProgress: e.cumulativeProgress,
      }))
    )
    const cumCompare = plannedCumulativeSeries(
      periodDates.map((d) => {
        const e = compareByDate.get(d)
        return {
          periodProgress: e?.periodProgress ?? null,
          cumulativeProgress: e?.cumulativeProgress ?? null,
        }
      })
    )

    const periods = primaryEntries.map((e, i) => {
      const d = formatDateOnlyUtc(e.periodDate)
      return {
        periodDate: d,
        periodIndex: e.periodIndex,
        periodPlanned: decStr(e.periodProgress),
        cumulativePlanned: cumPrimary[i] ?? '0',
        periodPlannedCompare: compare ? decStr(compareByDate.get(d)?.periodProgress ?? null) : null,
        cumulativePlannedCompare: compare ? cumCompare[i] ?? '0' : null,
        periodActual: decStr(actualByDate.get(d)?.periodProgressPercent ?? null),
        cumulativeActual: decStr(actualByDate.get(d)?.cumulativeProgressPercent ?? null) ?? '',
        isLocked: e.isLocked,
        isExtended: e.isExtended,
      }
    })

    const allPlans = await projectProgressRepository.listPlansWithEntries(projectId)
    const planCurves = allPlans.map((plan) => {
      const cum = plannedCumulativeSeries(
        plan.entries.map((e) => ({
          periodProgress: e.periodProgress,
          cumulativeProgress: e.cumulativeProgress,
        }))
      )
      const byDate = new Map<string, string>()
      plan.entries.forEach((e, i) => {
        byDate.set(formatDateOnlyUtc(e.periodDate), cum[i] ?? '0')
      })
      const cumulativePlanned = periodDates.map((d) => {
        const v = byDate.get(d)
        return v !== undefined ? v : null
      })
      return {
        planId: plan.id,
        version: plan.version,
        label: plan.label,
        isBaseline: plan.isBaseline,
        cumulativePlanned,
      }
    })

    return {
      plans: planDtos,
      primaryPlanId: primary?.id ?? null,
      comparePlanId: compare?.id ?? null,
      periods,
      planCurves,
    }
  },

  async listPlans(projectId: string, user: AuthUser) {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'read')
    const plans = await projectProgressRepository.listPlans(projectId)
    return plans.map((p) => ({
      id: p.id,
      version: p.version,
      label: p.label,
      isBaseline: p.isBaseline,
      effectiveFromDate: formatDateOnlyUtc(p.effectiveFromDate),
      effectiveFromIdx: p.effectiveFromIdx,
      reason: p.reason,
      extraWeeks: p.extraWeeks,
    }))
  },

  async createPlan(projectId: string, user: AuthUser, body: unknown) {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'create')
    const parsed = progressPlanCreateSchema.parse(body)

    if (parsed.isBaseline) {
      const has = await projectProgressRepository.hasBaseline(projectId)
      if (has) {
        throw new AppError(400, 'VALIDATION_ERROR', '專案已有原始計畫（baseline），不可重複建立')
      }
    }

    const maxV = await projectProgressRepository.maxVersion(projectId)
    const version = parsed.isBaseline ? 0 : maxV + 1
    if (!parsed.isBaseline && maxV < 0) {
      throw new AppError(400, 'VALIDATION_ERROR', '請先建立原始計畫')
    }

    const eff = parseBodyDate(parsed.effectiveFromDate)
    const entries = parsed.entries.map((e) => ({
      periodDate: parseBodyDate(e.periodDate),
      periodIndex: e.periodIndex,
      periodProgress: toDecimalOrNull(e.periodProgress ?? null),
      cumulativeProgress: toDecimalOrNull(e.cumulativeProgress ?? null),
      isLocked: e.isLocked ?? false,
      isExtended: e.isExtended ?? false,
    }))

    const created = await projectProgressRepository.createPlan({
      projectId,
      version,
      label: parsed.label,
      reason: parsed.reason ?? null,
      isBaseline: parsed.isBaseline,
      effectiveFromDate: eff,
      effectiveFromIdx: parsed.effectiveFromIdx,
      extraWeeks: parsed.extraWeeks,
      entries,
    })

    return {
      id: created.id,
      version: created.version,
      label: created.label,
      isBaseline: created.isBaseline,
      effectiveFromDate: formatDateOnlyUtc(created.effectiveFromDate),
      effectiveFromIdx: created.effectiveFromIdx,
    }
  },

  async duplicatePlan(projectId: string, user: AuthUser, body: unknown) {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'create')
    const parsed = progressPlanDuplicateSchema.parse(body)

    const source = await projectProgressRepository.findPlanById(projectId, parsed.sourcePlanId)
    if (!source) throw new AppError(404, 'NOT_FOUND', '找不到來源計畫版本')

    const maxV = await projectProgressRepository.maxVersion(projectId)
    const version = maxV + 1

    const effDate = parsed.effectiveFromDate
      ? parseBodyDate(parsed.effectiveFromDate)
      : source.effectiveFromDate
    const effIdx = parsed.effectiveFromIdx ?? source.effectiveFromIdx

    const entries = source.entries.map((e) => ({
      periodDate: e.periodDate,
      periodIndex: e.periodIndex,
      periodProgress: e.periodProgress,
      cumulativeProgress: e.cumulativeProgress,
      isLocked: e.isLocked,
      isExtended: e.isExtended,
    }))

    const created = await projectProgressRepository.createPlan({
      projectId,
      version,
      label: parsed.label,
      reason: parsed.reason ?? null,
      isBaseline: false,
      effectiveFromDate: effDate,
      effectiveFromIdx: effIdx,
      extraWeeks: source.extraWeeks,
      entries,
    })

    return {
      id: created.id,
      version: created.version,
      label: created.label,
      isBaseline: created.isBaseline,
      effectiveFromDate: formatDateOnlyUtc(created.effectiveFromDate),
      effectiveFromIdx: created.effectiveFromIdx,
    }
  },

  async patchPlanEffective(projectId: string, planId: string, user: AuthUser, body: unknown) {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'update')
    const parsed = progressPlanEffectivePatchSchema.parse(body)

    const plan = await projectProgressRepository.findPlanById(projectId, planId)
    if (!plan) throw new AppError(404, 'NOT_FOUND', '找不到計畫版本')
    if (plan.isBaseline) {
      throw new AppError(403, 'FORBIDDEN', '原始計畫無變更生效時間，不可修改')
    }

    const entry = plan.entries.find(
      (e) => formatDateOnlyUtc(e.periodDate) === parsed.effectiveFromDate
    )
    if (!entry) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        '生效日期須為該計畫時間軸上其中一個週期'
      )
    }
    if (entry.periodIndex !== parsed.effectiveFromIdx) {
      throw new AppError(400, 'VALIDATION_ERROR', '生效週期索引與日期不一致')
    }

    await prisma.progressPlan.update({
      where: { id: planId },
      data: {
        effectiveFromDate: parseBodyDate(parsed.effectiveFromDate),
        effectiveFromIdx: parsed.effectiveFromIdx,
      },
    })

    return {
      effectiveFromDate: parsed.effectiveFromDate,
      effectiveFromIdx: parsed.effectiveFromIdx,
    }
  },

  async putPlanEntries(projectId: string, planId: string, user: AuthUser, body: unknown) {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'update')
    const parsed = progressPlanEntriesPutSchema.parse(body)

    const plan = await projectProgressRepository.findPlanById(projectId, planId)
    if (!plan) throw new AppError(404, 'NOT_FOUND', '找不到計畫版本')
    if (plan.isBaseline) {
      throw new AppError(403, 'FORBIDDEN', '原始計畫已鎖定，不可修改週期數值')
    }

    for (const e of parsed.entries) {
      await projectProgressRepository.upsertPlanEntry(planId, {
        periodDate: parseBodyDate(e.periodDate),
        periodIndex: e.periodIndex,
        periodProgress: toDecimalOrNull(e.periodProgress),
        isLocked: e.isLocked,
        isExtended: e.isExtended,
      })
    }

    return { ok: true as const }
  },

  async deletePlan(projectId: string, planId: string, user: AuthUser) {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'delete')

    const plan = await prisma.progressPlan.findFirst({
      where: { id: planId, projectId, ...notDeleted },
      select: { id: true, isBaseline: true },
    })
    if (!plan) throw new AppError(404, 'NOT_FOUND', '找不到計畫版本')

    if (plan.isBaseline) {
      const others = await projectProgressRepository.countOtherActivePlans(projectId, planId)
      if (others > 0) {
        throw new AppError(
          403,
          'FORBIDDEN',
          '請先刪除所有變更版本後，再刪除原始計畫'
        )
      }
    }

    const ok = await projectProgressRepository.softDeletePlanWithEntries(
      projectId,
      planId,
      user.id
    )
    if (!ok) throw new AppError(404, 'NOT_FOUND', '找不到計畫版本')

    await fileRepository.softDeleteByProjectBusinessAndCategory(
      projectId,
      planId,
      FILE_CATEGORY_PROGRESS_PLAN_IMPORT,
      user.id
    )

    return { ok: true as const }
  },

  async listPlanUploads(projectId: string, user: AuthUser) {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'read')

    const atts = await prisma.attachment.findMany({
      where: {
        projectId,
        category: FILE_CATEGORY_PROGRESS_PLAN_IMPORT,
        ...notDeleted,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        businessId: true,
        createdAt: true,
        uploadedBy: { select: { name: true } },
      },
    })

    const planIds = [...new Set(atts.map((a) => a.businessId).filter((x): x is string => Boolean(x)))]
    const plans =
      planIds.length === 0
        ? []
        : await prisma.progressPlan.findMany({
            where: { id: { in: planIds }, projectId, ...notDeleted },
            select: {
              id: true,
              version: true,
              label: true,
              isBaseline: true,
              effectiveFromDate: true,
              effectiveFromIdx: true,
            },
          })
    const planMap = new Map(plans.map((p) => [p.id, p]))

    return atts.map((a) => {
      const plan = a.businessId ? planMap.get(a.businessId) : undefined
      return {
        attachmentId: a.id,
        fileName: a.fileName,
        fileSize: a.fileSize,
        mimeType: a.mimeType,
        createdAt: a.createdAt.toISOString(),
        planId: a.businessId,
        planVersion: plan?.version ?? null,
        planLabel: plan?.label ?? null,
        planIsBaseline: plan?.isBaseline ?? null,
        effectiveFromDate:
          plan && !plan.isBaseline ? formatDateOnlyUtc(plan.effectiveFromDate) : null,
        effectiveFromIdx: plan && !plan.isBaseline ? plan.effectiveFromIdx : null,
        uploaderName: a.uploadedBy?.name ?? null,
      }
    })
  },

  async putActuals(projectId: string, user: AuthUser, body: unknown) {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'update')
    const parsed = progressActualsPutSchema.parse(body)

    for (const r of parsed.rows) {
      await projectProgressRepository.upsertActual(projectId, {
        periodDate: parseBodyDate(r.periodDate),
        periodIndex: r.periodIndex,
        periodProgressPercent: toDecimalOrNull(r.periodProgressPercent),
        ...(r.cumulativeProgressPercent === undefined
          ? {}
          : {
              cumulativeProgressPercent: toDecimalOrNull(r.cumulativeProgressPercent),
            }),
      })
    }

    return { ok: true as const }
  },

  /** 內建進度表 Excel 樣板（`resources/templates/progress_template.xlsx`，部署時 cwd 為專案根即可讀取） */
  async getProgressPlanExcelTemplateBuffer(projectId: string, user: AuthUser): Promise<Buffer> {
    await assertCanAccessProject(user, projectId)
    await assertProjectModuleAction(user, projectId, 'construction.progress', 'read')
    const abs = progressPlanExcelTemplateAbsPath()
    try {
      return await fs.readFile(abs)
    } catch (e: unknown) {
      const code =
        e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined
      if (code === 'ENOENT') {
        throw new AppError(404, 'NOT_FOUND', '進度表樣板檔尚未提供，請聯絡管理員')
      }
      throw new AppError(500, 'INTERNAL_ERROR', '讀取樣板失敗')
    }
  },
}
