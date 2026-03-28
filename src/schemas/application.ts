import { z } from 'zod'

export const submitApplicationSchema = z.object({
  email: z.string().email('請輸入有效的 Email'),
  password: z.string().min(6, '密碼至少 6 個字元'),
  name: z.string().min(1, '請輸入姓名').max(50),
  studentId: z.string().max(20).optional(),
  department: z.string().max(100).optional(),
  tenantId: z.string().cuid(),
})

export type SubmitApplicationBody = z.infer<typeof submitApplicationSchema>

export const rejectApplicationSchema = z.object({
  rejectReason: z.string().min(1, '請填寫拒絕原因'),
})

export type RejectApplicationBody = z.infer<typeof rejectApplicationSchema>
