import { z } from 'zod'

const overlayRowSchema = z.object({
  pccesItemId: z.string().min(1),
  /** 本日完成數量（表單目前值，與儲存後語意一致） */
  dailyQty: z.string().trim(),
})

export const constructionDailyLogPccesActualPreviewSchema = z.object({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** 編輯時排除本筆日誌之施工項目加總，改以 overlay 帶入表單列 */
  excludeLogId: z.string().min(1).optional(),
  /** 表單上目前之核定工項本日完成量（僅送 pccesItemId 有值之列） */
  overlayWorkItems: z.array(overlayRowSchema).optional().default([]),
})

export type ConstructionDailyLogPccesActualPreviewInput = z.infer<
  typeof constructionDailyLogPccesActualPreviewSchema
>
