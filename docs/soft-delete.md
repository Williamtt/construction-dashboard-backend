# 軟刪除（Soft delete）

## 欄位約定

- **`deletedAt`**：`DateTime?`，`null` 表示資料仍有效；設為時間戳即視為已刪除。
- **`deletedById`**：`String?`，執行刪除操作之使用者 `User.id`。**刻意不設 Prisma FK**，避免 `User` 上累積大量反向關聯。

共用常數與 helper 見 `src/shared/soft-delete.ts`：

- `notDeleted` → Prisma where 片段 `{ deletedAt: null }`
- `softDeleteSet(actorUserId)` → `{ deletedAt: new Date(), deletedById: actorUserId }`

## 查詢

- **列表、詳情、存在性檢查**：預設一律加上 `...notDeleted`（或等價條件），不要讓已刪除資料出現在正常業務流程。
- **跨表**：例如專案成員列表需同時排除已軟刪除的 `User`，可寫 `user: notDeleted`。
- **還原／匯入重複**：若商業規則允許「同一邏輯鍵」在軟刪後再建立，可 `findFirst` **不加** `deletedAt` 篩選，若找到已刪列則 `update` 清掉 `deletedAt`／`deletedById`（見 `projectMemberRepository.create`、`projectSelfInspectionLinkRepository.create`）。

## 刪除 API

- HTTP `DELETE` 在業務上應實作為 **`updateMany` / `update` + `softDeleteSet(req.user.id)`**，不要對有軟刪欄位之實體使用 `prisma.*.delete`，以免與稽核與唯一性策略衝突。

## 部分唯一索引（PostgreSQL）

下列欄位在 DB 層為「僅未刪除列唯一」，Prisma schema 已移除對應 `@@unique`，改以 migration 中的 partial unique index 維護：

- `Tenant.slug`（非 null 時）
- `User.email`
- `project_members (project_id, user_id)`
- `cameras.stream_token`
- `project_self_inspection_template_links (project_id, template_id)`

程式中請用 `findFirst({ where: { …, ...notDeleted } })`，**勿**再使用已移除的 compound `findUnique`（如 `projectId_userId`）。

## 子表／子樹

- **缺失改善／報修**：刪除主單時一併軟刪除底下執行紀錄（`defect_execution_records` / `repair_execution_records`）。
- **圖說節點**：刪除節點時先對子樹內 leaf 的 `drawing_revision` 附件走檔案軟刪，再對子樹內所有節點軟刪。
- **WBS**：刪除非根節點時先刪除 `wbs_node_resources` 連結（junction 無軟刪欄位，維持 `deleteMany`），再對子樹節點軟刪。
- **自主檢查樣板**：刪除樣板時依序軟刪 items → blocks → template。

## 純 junction（無 `deletedAt`）

下列表**沒有**軟刪欄位，仍可使用 `delete` / `deleteMany`：

- `user_photo_favorites`
- `album_photos`
- `wbs_node_resources`
- `project_issue_risk_wbs_nodes`

## 登入與權限

- 已軟刪除之 **`User`** 不得登入；JWT 中介層載入使用者時需帶 `deletedAt: null`。
- 租戶、專案若已軟刪除，非 `platform_admin` 之存取應拒絕（依現有 `auth`／專案存取邏輯）。

## 遷移與 Seed

- 套用 migration：`npm run db:migrate:dev` 或部署環境 `npx prisma migrate deploy`。
- `prisma/seed.ts` 已改為與 partial unique 相容：`tenant`／`user` 以 email、slug 找有效列或還原軟刪列；`project_member` 以 `ensureProjectMember` 避免依賴已移除的 compound upsert。

## 新功能檢查清單

1. 新 model 是否需要軟刪？若需要，migration 加欄位並更新本文件「適用表」列表。
2. 所有 `findMany` / `findFirst` / `count` 是否預設排除已刪除？
3. `DELETE` 路由是否改為 `softDeleteSet(actorId)`？
4. 是否仍有誤用 `findUnique` 搭配已改為 partial unique 的鍵？
