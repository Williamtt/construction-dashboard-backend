import { z } from 'zod'

const isoDateTimeString = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: '核定生效時間格式無效' })

/** PATCH .../pcces-imports/:importId — 版本名稱、核定生效時間（施工日誌選版）可擇一或併送 */
export const pccesImportPatchBodySchema = z
  .object({
    versionLabel: z.string().max(200).optional(),
    /** ISO 8601；null 表示清除自訂生效時間（改回以核定操作時間之日為準） */
    approvalEffectiveAt: z.union([isoDateTimeString, z.null()]).optional(),
  })
  .refine((d) => d.versionLabel !== undefined || d.approvalEffectiveAt !== undefined, {
    message: '請至少提供 versionLabel 或 approvalEffectiveAt',
  })

export type PccesImportPatchBody = z.infer<typeof pccesImportPatchBodySchema>
