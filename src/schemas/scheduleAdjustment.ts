import { z } from 'zod'

const typeEnum = z.enum(['extension', 'suspension', 'other'])
const statusEnum = z.enum(['pending', 'approved', 'rejected'])

export const createScheduleAdjustmentSchema = z.object({
  applyDate: z.string().min(1, '申請日期為必填'), // YYYY-MM-DD or ISO
  type: typeEnum,
  applyDays: z.number().int().min(0),
  approvedDays: z.number().int().min(0),
  status: statusEnum.optional().default('pending'),
})

export type CreateScheduleAdjustmentBody = z.infer<typeof createScheduleAdjustmentSchema>

export const updateScheduleAdjustmentSchema = z.object({
  applyDate: z.string().optional(),
  type: typeEnum.optional(),
  applyDays: z.number().int().min(0).optional(),
  approvedDays: z.number().int().min(0).optional(),
  status: statusEnum.optional(),
})

export type UpdateScheduleAdjustmentBody = z.infer<typeof updateScheduleAdjustmentSchema>
