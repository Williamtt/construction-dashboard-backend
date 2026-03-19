import { z } from 'zod'

export const importProjectSelfInspectionTemplateSchema = z.object({
  templateId: z.string().trim().min(1, '請選擇樣板'),
})

export type ImportProjectSelfInspectionTemplateBody = z.infer<
  typeof importProjectSelfInspectionTemplateSchema
>
