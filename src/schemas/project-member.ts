import { z } from 'zod'

export const addProjectMemberSchema = z.object({
  userId: z.string().min(1, '請選擇成員'),
})

export type AddProjectMemberBody = z.infer<typeof addProjectMemberSchema>

export const setProjectMemberStatusSchema = z.object({
  status: z.enum(['active', 'suspended'], { message: 'status 須為 active 或 suspended' }),
})

export type SetProjectMemberStatusBody = z.infer<typeof setProjectMemberStatusSchema>
