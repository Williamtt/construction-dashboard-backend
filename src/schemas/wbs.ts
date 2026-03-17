import { z } from 'zod'

export const createWbsNodeSchema = z.object({
  parentId: z.string().optional().nullable(),
  name: z.string().min(1, '項目名稱為必填').max(500),
})

export type CreateWbsNodeBody = z.infer<typeof createWbsNodeSchema>

export const updateWbsNodeSchema = z.object({
  name: z.string().min(1, '項目名稱為必填').max(500).optional(),
})

export type UpdateWbsNodeBody = z.infer<typeof updateWbsNodeSchema>

export const moveWbsNodeSchema = z.object({
  /** 插入於此節點之前（同層）；若為 null 或省略則插到父層最後 */
  insertBeforeId: z.string().optional().nullable(),
  /** 新父節點 id；null = 根層 */
  parentId: z.string().optional().nullable(),
})

export type MoveWbsNodeBody = z.infer<typeof moveWbsNodeSchema>
