import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('請輸入有效 Email'),
  password: z.string().min(1, '請輸入密碼'),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '請輸入目前密碼'),
  newPassword: z.string().min(6, '新密碼至少 6 碼'),
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(20, '無效的 refresh token'),
})

export type LoginBody = z.infer<typeof loginSchema>
export type ChangePasswordBody = z.infer<typeof changePasswordSchema>
export type RefreshTokenBody = z.infer<typeof refreshTokenSchema>
