import { z } from 'zod'

const statusSchema = z.enum(['active', 'archived'])

const timingOptionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(200),
})

/** 表單頂部基本資料欄位與檢查時機選項（現場 radio）、檢查結果圖例選項（現場 radio；與紙本 ○×／ 對齊） */
export const headerConfigSchema = z.object({
  /** 表頭「檢查名稱」欄位標題（現場單行文字） */
  inspectionNameLabel: z.string().trim().min(1).max(100).optional(),
  projectNameLabel: z.string().trim().min(1).max(100),
  subProjectLabel: z.string().trim().min(1).max(100),
  subcontractorLabel: z.string().trim().min(1).max(100),
  inspectionLocationLabel: z.string().trim().min(1).max(100),
  inspectionDateLabel: z.string().trim().min(1).max(100),
  timingSectionLabel: z.string().trim().min(1).max(100),
  timingOptions: z.array(timingOptionSchema).min(1).max(20),
  resultSectionLabel: z.string().trim().min(1).max(100),
  resultLegendOptions: z.array(timingOptionSchema).min(1).max(20),
})

export type HeaderConfig = z.infer<typeof headerConfigSchema>

export function defaultHeaderConfig(): HeaderConfig {
  return {
    inspectionNameLabel: '檢查名稱',
    projectNameLabel: '工程名稱',
    subProjectLabel: '分項工程名稱',
    subcontractorLabel: '協力廠商',
    inspectionLocationLabel: '檢查位置',
    inspectionDateLabel: '檢查日期',
    timingSectionLabel: '檢查時機',
    timingOptions: [
      { id: 'before', label: '施工前' },
      { id: 'during', label: '施工中檢查' },
      { id: 'after', label: '施工完成檢查' },
    ],
    resultSectionLabel: '檢查結果',
    resultLegendOptions: [
      { id: 'pass', label: '○ 檢查合格' },
      { id: 'fail', label: '× 有缺失需改正' },
      { id: 'na', label: '/ 無此檢查項目' },
    ],
  }
}

export function mergeHeaderConfig(stored: unknown): HeaderConfig {
  const base = defaultHeaderConfig()
  if (stored == null || typeof stored !== 'object' || Array.isArray(stored)) {
    return base
  }
  const o = stored as Record<string, unknown>
  const timingRaw = o.timingOptions
  let timingOptions = base.timingOptions
  if (Array.isArray(timingRaw)) {
    const parsed = z.array(timingOptionSchema).safeParse(timingRaw)
    if (parsed.success && parsed.data.length > 0) {
      timingOptions = parsed.data
    }
  }
  return {
    inspectionNameLabel:
      typeof o.inspectionNameLabel === 'string' && o.inspectionNameLabel.trim()
        ? o.inspectionNameLabel.trim().slice(0, 100)
        : base.inspectionNameLabel,
    projectNameLabel:
      typeof o.projectNameLabel === 'string' && o.projectNameLabel.trim()
        ? o.projectNameLabel.trim().slice(0, 100)
        : base.projectNameLabel,
    subProjectLabel:
      typeof o.subProjectLabel === 'string' && o.subProjectLabel.trim()
        ? o.subProjectLabel.trim().slice(0, 100)
        : base.subProjectLabel,
    subcontractorLabel:
      typeof o.subcontractorLabel === 'string' && o.subcontractorLabel.trim()
        ? o.subcontractorLabel.trim().slice(0, 100)
        : base.subcontractorLabel,
    inspectionLocationLabel:
      typeof o.inspectionLocationLabel === 'string' && o.inspectionLocationLabel.trim()
        ? o.inspectionLocationLabel.trim().slice(0, 100)
        : base.inspectionLocationLabel,
    inspectionDateLabel:
      typeof o.inspectionDateLabel === 'string' && o.inspectionDateLabel.trim()
        ? o.inspectionDateLabel.trim().slice(0, 100)
        : base.inspectionDateLabel,
    timingSectionLabel:
      typeof o.timingSectionLabel === 'string' && o.timingSectionLabel.trim()
        ? o.timingSectionLabel.trim().slice(0, 100)
        : base.timingSectionLabel,
    timingOptions,
    resultSectionLabel:
      typeof o.resultSectionLabel === 'string' && o.resultSectionLabel.trim()
        ? o.resultSectionLabel.trim().slice(0, 100)
        : base.resultSectionLabel,
    resultLegendOptions: mergeResultLegendOptions(o, base.resultLegendOptions),
  }
}

function mergeResultLegendOptions(
  o: Record<string, unknown>,
  fallback: { id: string; label: string }[]
): { id: string; label: string }[] {
  const raw = o.resultLegendOptions
  if (Array.isArray(raw)) {
    const parsed = z.array(timingOptionSchema).safeParse(raw)
    if (parsed.success && parsed.data.length > 0) {
      return parsed.data
    }
  }
  // 舊版僅存 resultLegend 長字串：無結構化選項時改用預設三項
  return fallback
}

export const createSelfInspectionTemplateSchema = z.object({
  name: z.string().trim().min(1, '請填寫樣板名稱').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  status: statusSchema.optional(),
  headerConfig: headerConfigSchema.optional(),
})

export const updateSelfInspectionTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  status: statusSchema.optional(),
  headerConfig: headerConfigSchema.optional(),
})

export const createSelfInspectionBlockSchema = z.object({
  title: z.string().trim().min(1, '請填寫區塊標題').max(200),
  description: z.string().trim().max(2000).optional().nullable(),
})

export const updateSelfInspectionBlockSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
})

export const createSelfInspectionBlockItemSchema = z.object({
  categoryLabel: z.string().trim().min(1, '請填寫分類（列首合併用）').max(200),
  itemName: z.string().trim().min(1, '請填寫檢查項目').max(500),
  standardText: z.string().trim().min(1, '請填寫檢查標準').max(10000),
})

export const updateSelfInspectionBlockItemSchema = z.object({
  categoryLabel: z.string().trim().min(1).max(200).optional(),
  itemName: z.string().trim().min(1).max(500).optional(),
  standardText: z.string().trim().min(1).max(10000).optional(),
  sortOrder: z.number().int().min(0).optional(),
})

export type CreateSelfInspectionTemplateBody = z.infer<typeof createSelfInspectionTemplateSchema>
export type UpdateSelfInspectionTemplateBody = z.infer<typeof updateSelfInspectionTemplateSchema>
export type CreateSelfInspectionBlockBody = z.infer<typeof createSelfInspectionBlockSchema>
export type UpdateSelfInspectionBlockBody = z.infer<typeof updateSelfInspectionBlockSchema>
export type CreateSelfInspectionBlockItemBody = z.infer<typeof createSelfInspectionBlockItemSchema>
export type UpdateSelfInspectionBlockItemBody = z.infer<typeof updateSelfInspectionBlockItemSchema>
