/**
 * 統一軟刪除：資料列保留於 DB，以 deletedAt 標記；deletedById 記錄操作者 User.id（無 FK，避免 User 反向關聯爆炸）。
 * 列表／預設查詢一律加上 notDeleted；DELETE API 改為 update softDeleteSet。
 */
export const notDeleted = { deletedAt: null } as const

export function softDeleteSet(deletedById: string): { deletedAt: Date; deletedById: string } {
  return { deletedAt: new Date(), deletedById }
}
