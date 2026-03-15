import { z } from 'zod'

export const createCameraSchema = z.object({
  name: z.string().min(1, '名稱為必填').max(100),
  /** 選填：設備 RTSP URL（含帳密時會加密儲存），供 go2rtc 設定範例或下載包使用 */
  sourceUrl: z.string().url().optional().or(z.literal('')),
})

export const updateCameraSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  /** 舊版：整段 RTSP URL（仍支援）；若改為分欄則用下方欄位 */
  sourceUrl: z.string().url().optional().or(z.literal('')).nullable(),
  /** 分欄：設備 IP 或主機名 */
  sourceHost: z.string().min(1).max(255).optional(),
  /** 分欄：RTSP 埠，預設 554 */
  sourcePort: z.number().int().min(1).max(65535).optional(),
  /** 分欄：路徑，如 /stream1 */
  sourcePath: z.string().max(500).optional(),
  /** 分欄：是否有帳號密碼 */
  hasCredentials: z.boolean().optional(),
  /** 分欄：帳號（hasCredentials 為 true 時填寫） */
  username: z.string().max(200).optional(),
  /** 分欄：密碼（hasCredentials 為 true 時填寫） */
  password: z.string().max(200).optional(),
})

/** 手動標示連線狀態（僅支援標示為離線，不影響實際串流） */
export const connectionStatusOverrideSchema = z.object({
  override: z.enum(['offline']).nullable(),
})
export type ConnectionStatusOverrideInput = z.infer<typeof connectionStatusOverrideSchema>

export type CreateCameraInput = z.infer<typeof createCameraSchema>
export type UpdateCameraInput = z.infer<typeof updateCameraSchema>
