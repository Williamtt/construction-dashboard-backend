import { z } from 'zod'

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '須為 YYYY-MM-DD')

export const progressPlanEntryInputSchema = z.object({
  periodDate: dateStr,
  periodIndex: z.number().int().min(0),
  periodProgress: z.number().finite().nullable().optional(),
  /** Excel 累計預定 %（第 3 欄）；有則圖表與累計列以此為準 */
  cumulativeProgress: z.number().finite().nullable().optional(),
  isLocked: z.boolean().optional(),
  isExtended: z.boolean().optional(),
})

export const progressPlanCreateSchema = z
  .object({
    label: z.string().min(1).max(200),
    reason: z.string().max(2000).optional().nullable(),
    isBaseline: z.boolean().optional().default(false),
    effectiveFromDate: dateStr,
    effectiveFromIdx: z.number().int().min(0),
    extraWeeks: z.number().int().min(0).optional().default(0),
    entries: z.array(progressPlanEntryInputSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const entry = data.entries.find((e) => e.periodDate === data.effectiveFromDate)
    if (!entry) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '生效日期須與其中一筆時間區間（與 entries 內日期欄一致）',
        path: ['effectiveFromDate'],
      })
      return
    }
    if (entry.periodIndex !== data.effectiveFromIdx) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'effectiveFromIdx 須與生效日期該列的 periodIndex 一致',
        path: ['effectiveFromIdx'],
      })
    }
  })

export const progressPlanDuplicateSchema = z.object({
  sourcePlanId: z.string().min(1),
  label: z.string().min(1).max(200),
  reason: z.string().max(2000).optional().nullable(),
  effectiveFromDate: dateStr.optional(),
  effectiveFromIdx: z.number().int().min(0).optional(),
})

export const progressPlanEntriesPutSchema = z.object({
  entries: z.array(
    z.object({
      periodDate: dateStr,
      periodIndex: z.number().int().min(0),
      periodProgress: z.number().finite().nullable(),
      isLocked: z.boolean().optional(),
      isExtended: z.boolean().optional(),
    })
  ),
})

export const progressActualsPutSchema = z.object({
  rows: z.array(
    z.object({
      periodDate: dateStr,
      periodIndex: z.number().int().min(0),
      periodProgressPercent: z.number().finite().nullable(),
      /** 累計實際 %（手填；與本期分開儲存） */
      cumulativeProgressPercent: z.number().finite().nullable().optional(),
    })
  ),
})

/** 僅更新變更版本之生效週期（須對齊該計畫 entries 之期別） */
export const progressPlanEffectivePatchSchema = z.object({
  effectiveFromDate: dateStr,
  effectiveFromIdx: z.number().int().min(0),
})

export type ProgressPlanCreateInput = z.infer<typeof progressPlanCreateSchema>
export type ProgressPlanDuplicateInput = z.infer<typeof progressPlanDuplicateSchema>
export type ProgressPlanEntriesPutInput = z.infer<typeof progressPlanEntriesPutSchema>
export type ProgressActualsPutInput = z.infer<typeof progressActualsPutSchema>
export type ProgressPlanEffectivePatchInput = z.infer<typeof progressPlanEffectivePatchSchema>
