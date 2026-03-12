import { z } from 'zod'

export const createTenantSchema = z.object({
  name: z.string().min(1, '租戶名稱為必填'),
  slug: z.string().min(1).optional().nullable(),
  status: z.enum(['active', 'suspended']).optional().default('active'),
  expiresAt: z.string().optional().nullable(), // ISO date or YYYY-MM-DD
  userLimit: z.number().int().min(0).optional().nullable(),
  fileSizeLimitMb: z.number().int().min(0).optional().nullable(),
  storageQuotaMb: z.number().int().min(0).optional().nullable(),
})

export type CreateTenantBody = z.infer<typeof createTenantSchema>

export const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional().nullable(),
  status: z.enum(['active', 'suspended']).optional(),
  expiresAt: z.string().optional().nullable(),
  userLimit: z.number().int().min(0).optional().nullable(),
  fileSizeLimitMb: z.number().int().min(0).optional().nullable(),
  storageQuotaMb: z.number().int().min(0).optional().nullable(),
})
export type UpdateTenantBody = z.infer<typeof updateTenantSchema>
