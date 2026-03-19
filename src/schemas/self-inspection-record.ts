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
})

export type FilledPayloadInput = z.infer<typeof filledPayloadSchema>

export const createProjectSelfInspectionRecordSchema = z.object({
  filledPayload: filledPayloadSchema,
})

export type CreateProjectSelfInspectionRecordBody = z.infer<
  typeof createProjectSelfInspectionRecordSchema
>
