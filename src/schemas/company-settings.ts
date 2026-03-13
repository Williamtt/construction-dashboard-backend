import { z } from 'zod'

/** 公司設定：名稱（租戶名稱） */
export const updateCompanySettingsSchema = z.object({
  name: z.string().min(1, '公司名稱為必填').max(200),
})
export type UpdateCompanySettingsBody = z.infer<typeof updateCompanySettingsSchema>
