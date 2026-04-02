import { z } from 'zod'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '請使用 YYYY-MM-DD')

function toDecimalString(v: unknown): string {
  if (v === null || v === undefined) return '0'
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  const s = String(v).replace(/,/g, '').trim()
  if (s === '') return '0'
  const n = parseFloat(s)
  return Number.isFinite(n) ? String(n) : '0'
}

const decimalField = z.union([z.string(), z.number()]).transform(toDecimalString)

const optionalDecimal = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((v) => {
    if (v === undefined || v === null) return undefined
    const s = String(v).replace(/,/g, '').trim()
    if (s === '') return undefined
    return toDecimalString(v)
  })

export const supervisionReportInspectionInputSchema = z.object({
  category: z.enum(['random_check', 'civil', 'mep', 'deficiency']),
  description: z.string().min(1).max(8000),
})

export const supervisionReportMaterialCheckInputSchema = z.object({
  category: z.enum(['incoming', 'secondary', 'joint']),
  description: z.string().min(1).max(8000),
  referenceNo: z.string().max(1000).default(''),
})

export const supervisionReportWorkItemInputSchema = z.object({
  pccesItemId: z.string().min(1).max(128).optional(),
  workItemName: z.string().min(1).max(4000),
  unit: z.string().max(100).default(''),
  contractQty: decimalField,
  dailyCompletedQty: decimalField,
  accumulatedCompletedQty: decimalField,
  remark: z.string().max(8000).default(''),
})

const baseBody = {
  reportNo: z.string().max(200).optional().nullable(),
  weatherAm: z.string().max(200).optional().nullable(),
  weatherPm: z.string().max(200).optional().nullable(),
  reportDate: isoDate,

  projectName: z.string().min(1).max(2000),
  contractDuration: z.coerce.number().int().min(0).max(365000).optional().nullable(),
  startDate: isoDate.optional().nullable(),
  plannedCompletionDate: isoDate.optional().nullable(),
  actualCompletionDate: isoDate.optional().nullable(),
  contractChangeCount: z.coerce.number().int().min(0).max(9999).optional().nullable(),
  extensionDays: z.coerce.number().int().min(0).max(365000).optional().nullable(),
  originalContractAmount: optionalDecimal,
  designFee: optionalDecimal,
  contractTotal: optionalDecimal,

  constructionPlannedProgress: z.coerce.number().min(0).max(100).optional().nullable(),
  constructionActualProgress: z.coerce.number().min(0).max(100).optional().nullable(),
  overallPlannedProgress: z.coerce.number().min(0).max(100).optional().nullable(),
  overallActualProgress: z.coerce.number().min(0).max(100).optional().nullable(),

  inspectionNotes: z.string().max(30000).default(''),
  materialQualityNotes: z.string().max(30000).default(''),
  preWorkCheckCompleted: z.boolean().default(false),
  safetyNotes: z.string().max(30000).default(''),
  otherSupervisionNotes: z.string().max(30000).default(''),
  supervisorSigned: z.boolean().default(false),

  inspections: z.array(supervisionReportInspectionInputSchema).default([]),
  materialChecks: z.array(supervisionReportMaterialCheckInputSchema).default([]),
  workItems: z.array(supervisionReportWorkItemInputSchema).default([]),
}

export const supervisionReportCreateSchema = z.object(baseBody)
export const supervisionReportUpdateSchema = z.object(baseBody)

export type SupervisionReportCreateInput = z.infer<typeof supervisionReportCreateSchema>
export type SupervisionReportUpdateInput = z.infer<typeof supervisionReportUpdateSchema>
