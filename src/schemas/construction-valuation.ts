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

export const constructionValuationLineInputSchema = z.object({
  pccesItemId: z.string().min(1).max(128).optional(),
  itemNo: z.string().max(200).default(''),
  description: z.string().min(1).max(8000),
  unit: z.string().max(100).default(''),
  contractQty: decimalField,
  approvedQtyAfterChange: z
    .any()
    .optional()
    .transform((v) => {
      if (v === null || v === undefined || v === '') return null
      return toDecimalString(v)
    }),
  unitPrice: decimalField,
  currentPeriodQty: decimalField,
  remark: z.string().max(8000).default(''),
  /** 階層麵包屑（與 PccesItem.path）；儲存時後端會再依綁定工項／手填內容寫入 */
  path: z.string().max(32000).optional().default(''),
})

const valuationHeader = {
  title: z.string().max(500).optional().nullable(),
  valuationDate: isoDate.optional().nullable(),
  headerRemark: z.string().max(8000).default(''),
  lines: z.array(constructionValuationLineInputSchema).min(1),
}

export const constructionValuationCreateSchema = z.object(valuationHeader)

export const constructionValuationUpdateSchema = z.object(valuationHeader)

export type ConstructionValuationCreateInput = z.infer<typeof constructionValuationCreateSchema>
