import { z } from 'zod'

export const createProjectSchema = z.object({
  name: z.string().min(1, '專案名稱為必填'),
  description: z.string().optional(),
  code: z.string().optional(),
  status: z.enum(['active', 'archived']).optional().default('active'),
  tenantId: z.string().cuid().optional().nullable(),
})

export type CreateProjectBody = z.infer<typeof createProjectSchema>

const projectInfoSchema = z.object({
  name: z.string().min(1, '專案名稱為必填').optional(),
  description: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  status: z.enum(['active', 'archived']).optional(),
  designUnit: z.string().optional().nullable(),
  supervisionUnit: z.string().optional().nullable(),
  contractor: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  benefits: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(), // ISO date
  plannedEndDate: z.string().optional().nullable(),
  revisedEndDate: z.string().optional().nullable(), // 變更竣工日期
  siteManager: z.string().optional().nullable(),
  contactPhone: z.string().optional().nullable(),
  projectStaff: z.string().optional().nullable(),
})

export const updateProjectSchema = projectInfoSchema.partial()
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>
