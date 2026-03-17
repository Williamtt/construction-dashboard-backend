import { z } from 'zod'

const resourceTypeEnum = z.enum(['labor', 'equipment', 'material'])

export const createProjectResourceSchema = z.object({
  type: resourceTypeEnum,
  name: z.string().min(1, '名稱為必填').max(200),
  unit: z.string().min(1, '單位為必填').max(50),
  unitCost: z.number().min(0, '單位成本不可為負').finite(),
  capacityType: z.string().max(100).optional().nullable(),
  dailyCapacity: z.number().min(0).finite().optional().nullable(),
  vendor: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
})

export type CreateProjectResourceBody = z.infer<typeof createProjectResourceSchema>

export const updateProjectResourceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(50).optional(),
  unitCost: z.number().min(0).finite().optional(),
  capacityType: z.string().max(100).optional().nullable(),
  dailyCapacity: z.number().min(0).finite().optional().nullable(),
  vendor: z.string().max(200).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
})

export type UpdateProjectResourceBody = z.infer<typeof updateProjectResourceSchema>
