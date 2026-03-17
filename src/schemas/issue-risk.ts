import { z } from 'zod'

const urgencyEnum = z.enum(['low', 'medium', 'high', 'critical'])
const statusEnum = z.enum(['open', 'in_progress', 'resolved', 'closed'])

export const createIssueRiskSchema = z.object({
  description: z.string().min(1, '議題說明為必填').max(2000),
  assigneeId: z.string().optional().nullable(),
  urgency: urgencyEnum.default('medium'),
  status: statusEnum.default('open'),
  /** 影像任務：僅能為沒有子節點的 WBS 節點 id 陣列 */
  wbsNodeIds: z.array(z.string()).default([]),
})

export type CreateIssueRiskBody = z.infer<typeof createIssueRiskSchema>

export const updateIssueRiskSchema = z.object({
  description: z.string().min(1).max(2000).optional(),
  assigneeId: z.string().optional().nullable(),
  urgency: urgencyEnum.optional(),
  status: statusEnum.optional(),
  wbsNodeIds: z.array(z.string()).optional(),
})

export type UpdateIssueRiskBody = z.infer<typeof updateIssueRiskSchema>
