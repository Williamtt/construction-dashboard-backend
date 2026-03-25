import { z } from 'zod'

const headerValuesSchema = z.object({
  inspectionName: z.string().trim().max(500).optional(),
  projectName: z.string().trim().max(500).optional(),
  subProjectName: z.string().trim().max(500).optional(),
  subcontractor: z.string().trim().max(500).optional(),
  inspectionLocation: z.string().trim().max(500).optional(),
  inspectionDate: z.string().trim().max(40).optional(),
  timingOptionId: z.string().trim().max(64).optional(),
})

const itemFillSchema = z.object({
  actualText: z.string().trim().max(5000).optional(),
  resultOptionId: z.string().trim().max(64).optional(),
})

export const filledPayloadSchema = z.object({
  header: headerValuesSchema.optional(),
  items: z.record(z.string(), itemFillSchema).optional(),
  /** 已上傳附件 id（`POST /files/upload`，category=`self_inspection_photo`） */
  photoAttachmentIds: z.array(z.string().trim().min(1).max(64)).max(30).nullish(),
})

export type FilledPayloadInput = z.infer<typeof filledPayloadSchema>

export const createProjectSelfInspectionRecordSchema = z.object({
  filledPayload: filledPayloadSchema,
})

export type CreateProjectSelfInspectionRecordBody = z.infer<
  typeof createProjectSelfInspectionRecordSchema
>

/** PATCH 與 POST 相同 body：`{ filledPayload }` */
export const updateProjectSelfInspectionRecordSchema = createProjectSelfInspectionRecordSchema

export type UpdateProjectSelfInspectionRecordBody = z.infer<
  typeof updateProjectSelfInspectionRecordSchema
>
