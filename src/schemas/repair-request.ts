import { z } from 'zod'

const statusEnum = z.enum(['in_progress', 'completed'])

export const createRepairRequestSchema = z.object({
  customerName: z.string().min(1, '請填寫客戶姓名'),
  contactPhone: z.string().min(1, '請填寫聯絡電話'),
  repairContent: z.string().min(1, '請填寫報修內容'),
  unitLabel: z.string().optional(),
  remarks: z.string().optional(),
  problemCategory: z.string().min(1, '請選擇問題類別'),
  isSecondRepair: z.boolean().optional().default(false),
  /** ISO 日期時間或 YYYY-MM-DD */
  deliveryDate: z.string().optional(),
  repairDate: z.string().optional(),
  status: statusEnum.optional().default('in_progress'),
  photoAttachmentIds: z.array(z.string()).optional(),
  fileAttachmentIds: z.array(z.string()).optional(),
})

export type CreateRepairRequestBody = z.infer<typeof createRepairRequestSchema>

export const updateRepairRequestSchema = z.object({
  customerName: z.string().min(1).optional(),
  contactPhone: z.string().min(1).optional(),
  repairContent: z.string().min(1).optional(),
  unitLabel: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
  problemCategory: z.string().min(1).optional(),
  isSecondRepair: z.boolean().optional(),
  deliveryDate: z.union([z.string(), z.null()]).optional(),
  repairDate: z.union([z.string(), z.null()]).optional(),
  status: statusEnum.optional(),
})

export type UpdateRepairRequestBody = z.infer<typeof updateRepairRequestSchema>

export const createRepairExecutionRecordSchema = z.object({
  content: z.string().min(1, '報修紀錄內容為必填').max(5000),
  /** 已上傳的附件 ID（同專案，建立後綁定 businessId=recordId, category=repair_record） */
  attachmentIds: z.array(z.string().cuid()).optional().default([]),
})

export type CreateRepairExecutionRecordBody = z.infer<typeof createRepairExecutionRecordSchema>
