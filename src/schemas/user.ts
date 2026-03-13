import { z } from 'zod'

const systemRoleEnum = z.enum(['platform_admin', 'tenant_admin', 'project_user'])
const memberTypeEnum = z.enum(['internal', 'external'])

export const createUserSchema = z.object({
  email: z.string().email('請輸入有效 Email'),
  password: z.string().min(6, '密碼至少 6 碼'),
  name: z.string().optional(),
  systemRole: systemRoleEnum.optional().default('project_user'),
  memberType: memberTypeEnum.optional().default('internal'),
  tenantId: z.string().cuid().optional().nullable(),
})

export type CreateUserBody = z.infer<typeof createUserSchema>

const userStatusEnum = z.enum(['active', 'suspended'])
export const updateUserSchema = z.object({
  name: z.string().optional(),
  systemRole: systemRoleEnum.optional(),
  memberType: memberTypeEnum.optional(),
  status: userStatusEnum.optional(),
})
export type UpdateUserBody = z.infer<typeof updateUserSchema>

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(6, '密碼至少 6 碼'),
})
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>
