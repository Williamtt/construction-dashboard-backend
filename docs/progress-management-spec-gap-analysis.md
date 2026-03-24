# 進度管理模組規格書 vs 現有系統對照報告

本文件將《進度管理模組 — Cursor 開發規格書》與 **construction-dashboard-backend**、**construction-dashboard-frontend** 現有架構與資料模型對照，供實作前決策與分工參考。

---

## 1. 總覽結論

| 面向 | 現況 | 與規格差異 |
|------|------|------------|
| 資料模型 | **無** `contract_versions`、`progress_plans`、`progress_actuals` 等表 | 規格中的五張核心表皆需 **全新建立**（並遵守專案軟刪除：`deletedAt` / `deletedById`） |
| 合約／工項 | 以 **PCCES XML 匯入**（`PccesImport` / `PccesItem`）為主 | 與規格「工項清單 Excel」欄位與版本語意**部分重疊**，需決定 **共用 / 對照 / 獨立** |
| 預定進度 | 施工日誌 API 用 **開工日＋核定工期** 算 **線性** 預定 % | 規格為 **週期 S-curve**（Excel 匯入、多版本疊線），**邏輯不同** |
| 實際進度 | 日誌主檔 **單日** `actualProgress`（%）；工項列有 **本日／累計數量** | 規格為 **週** `progress_actuals` + `actual_item_quantities`；`source` 含 `diary` 預留與現有日誌 **可銜接但粒度不同** |
| 工期變更 | `ProjectScheduleAdjustment`（展延／停工等） | 與規格「純工期調整＋追加週」**概念重疊**，尚未與計畫版本或 S-curve 時間軸綁定 |
| API 風格 | `/api/v1/projects/:projectId/...`、模組化 routes + controller/service/repository | 規格路徑為 `/api/projects/:id/...`，實作時應 **對齊現有 v1 與命名** |
| 圖表技術 | 前端慣用 **vue-echarts**；**未**引入 D3 | 規格要求 **D3 v7** 做格線／點位對齊，需 **新增依賴** 或書面調整為 ECharts（會影響「精確對齊」實作方式） |
| Excel | 前端已有 **xlsx**；後端 **無** SheetJS | 若匯入在伺服端解析，後端需 **新增 xlsx**（或僅前端解析後送 JSON） |

---

## 2. 資料庫與 Prisma

### 2.1 規格表在現有 schema 中的狀態

- **`contract_versions` / `contract_items` / `progress_plans` / `progress_plan_entries` / `progress_actuals` / `actual_item_quantities`**：目前 **皆不存在**。
- 主鍵慣例：現有專案普遍使用 **`@default(cuid())`** 之 `String`，表名多為 **snake_case `@@map`**；規格範例為 **UUID**。建議新表 **延續 cuid + 現有 soft-delete 欄位**，避免與全庫風格分裂。

### 2.2 與現有「合約／工項」模型的關係

現有與「工項、數量、單價、金額」最接近的是：

- **`PccesImport`**：`@@unique([projectId, version])`，一專案多版核定資料。
- **`PccesItem`**：`quantity`、`unitPrice`、`amountImported`、樹狀 `itemKey` / `parentItemKey`、`itemKind`（是否可填量由 API／前端決定）。

**對照規格 `contract_items`：**

- 語意上可比「某版合約底下的工項列」，但 PCCES 為 **XML 樹狀＋kind**，不是扁平「項次＋六欄 Excel」。
- **可能整合策略**（待產品拍板）：
  1. **進度模組獨立** `contract_versions` / `contract_items`（Excel 匯入），與 PCCES **並存**，必要時用 `original_item_id` 或外鍵對照 `PccesItem.id`。
  2. **以 PCCES 最新核定版** 當「當前合約分母」，進度週報的 `contract_item_id` 指向 `PccesItem`（需處理換版、軟刪、非 general 列是否進分母）。
  3. **混合**：金額分母來自 PCCES，S-curve 計畫來自獨立 `progress_plans`（版本與合約變更解耦）。

### 2.3 施工日誌（對規格「diary」與完成數量）

| 規格概念 | 現有實體／欄位 | 說明 |
|----------|----------------|------|
| 整體實際進度 %（手填） | `ConstructionDailyLog.actualProgress` | **每日一筆**；後端註解明載為人工填寫 |
| 工項本日／累計完成數量 | `ConstructionDailyLogWorkItem.dailyQty`、`accumulatedQty` | 可綁 `pccesItemId`；與 **最新核定 PCCES** 驗證與聚合 |
| 預定進度 % | API **計算欄位** `plannedProgress` | 見下節，**非**存在 DB 的週期計畫 |

**回答規格書「待確認：施工日誌已完成數量對應哪張表」：**  
對應 **`construction_daily_log_work_items`**（`daily_qty` / `accumulated_qty`）；整體 % 在 **`construction_daily_logs.actual_progress`**。與規格 `actual_item_quantities` **不是同一張表**，若要 `source = 'diary'`，需定義 **週彙總規則**（例如週內最後一日、加總本週 `daily_qty`、或與日誌主檔 % 的優先順序）。

### 2.4 估驗計價

- **`ConstructionValuation` / `ConstructionValuationLine`**：本次估驗數量、契約／變更後數量等，屬 **付款／估驗** 領域。
- 與規格「累計完成金額當分子」可能 **數值相關但業務不同**；若自動帶入需明確 **是否與估驗同期鎖定**，避免雙重來源。

### 2.5 工期調整

- **`ProjectScheduleAdjustment`**：`extension` / `suspension` / `other`，含核定天數，影響專案 **`revisedEndDate`** 等展示。
- 規格 **純工期調整**（`extra_weeks`、`is_extended` 週次）可與之 **對齊或互參**，但目前 **沒有** `progress_plan_entries` 層級的鎖定／複製邏輯。

---

## 3. 商業邏輯對照

### 3.1 累計進度 %（分子／分母）

- **規格**：分母 = 當前合約版本有效工項金額加總；分子 = 週期 `period_amount` 累加；**% 不落庫**。
- **現況**：無週期金額進度表；日誌側為 **日** 維度手填 % + 工項數量；儀表板 `useDashboardKpi` 的 `plannedProgressPercent` / `actualProgressPercent` 目前為 **固定 0**，**尚未接 API**。

### 3.2 預定進度曲線

- **規格**：週期、可匯入、多版本、baseline 虛線、變更後分段鎖定。
- **現況**（`construction-daily-log.service.ts`）：`computePlannedProgressPercent` 為 **經過天數／核定工期** 的 **線性比例**，上限 100%。與 **S-curve 計畫表** 無資料來源關聯。

### 3.3 變更類型矩陣

規格中的純工期／數量／增刪工項等，現有分散在：

- PCCES：`PccesItemChange`（Excel 變更匯入紀錄）。
- 專案：`ProjectScheduleAdjustment`。

**尚無**統一的 `change_type` 與「計畫版本＋合約版本」併存流程。

---

## 4. API 與後端架構

### 4.1 路徑與掛載方式

- 現有子資源掛在 **`projectsRouter.use('/:projectId/...', router)`**，例如 `construction-daily-logs`、`pcces-imports`。
- 建議新進度 API 改為例如：  
  `GET/POST /api/v1/projects/:projectId/progress/plans`  
  `GET/POST /api/v1/projects/:projectId/progress/actuals`  
  `GET /api/v1/projects/:projectId/progress/chart`  
  以及合約版本：  
  `.../contracts`、`.../contracts/:versionId/items`、`.../import`（與規格語意一致即可，路徑保留 **kebab-case**）。

### 4.2 模組與權限

- 專案 RBAC 模組定義於 `src/constants/permission-modules.ts`（前端有對應檔）。目前有 `construction.diary`、`construction.pcces` 等，**無** `construction.progress`（或類似 id）。
- 新功能需：**後端 assertProjectModuleAction**、**前端 NAV_PATH_PERMISSION_MODULE**、側欄／路由註冊（見 `project-module-permissions` 規則）。

### 4.3 Excel 匯入實作位置

- 後端 PCCES 使用 **fast-xml-parser**，**沒有** xlsx。
- 若規格要求伺服端解析 Excel，需 **新增依賴** 或改由 **前端 xlsx 解析** 後以 JSON 提交（注意大檔與驗證仍在後端 Zod）。

### 4.4 規格中的範例程式與現有慣例

- Prisma 欄位在 schema 為 **camelCase** + `@map("snake_case")`，與範例 `project_id` 寫法需轉換。
- 查詢需合併 **`notDeleted`**（軟刪除規範）。

---

## 5. 前端架構

### 5.1 路由與導航

- 專案內路徑慣例：`/p/:projectId/...`，常數在 `src/constants/routes.ts`、`navigation.ts`、`breadcrumb.ts`。
- 「進度管理」應新增 **path 後綴**（例如 `/construction/progress` 或契約群組下子路徑），並掛 **權限模組**。

### 5.2 圖表

- 依賴內有 **echarts**、**vue-echarts**，**無 d3**。
- 規格強調 **CELL_W / lineX / ptX** 與底表對齊：用 D3 較直觀；若堅持全站 ECharts，需評估 **自訂 grid 與轉換函式** 是否可達同等對齊。

### 5.3 主題

- 規格內寫死色碼（`#185FA5` 等）；專案規範要求 **淺／深色語意 token**。實作時建議改為 **CSS 變數或依 `useThemeStore().isDark` 映射**，與 `theme-support.mdc` 一致。

### 5.4 儀表板 KPI

- `useDashboardKpi` 僅載入專案日期資訊，**進度百分比未串接**；進度模組上線後可考慮 **同一 chart API 或輕量 KPI endpoint** 餵給儀表板。

---

## 6. 規格書「待確認事項」— 依現況的初步建議

| 待確認項 | 依現況的建議方向 |
|----------|------------------|
| 施工日誌「已完成數量」對應表 | **`construction_daily_log_work_items`**；整體 % 在 **`construction_daily_logs.actual_progress`**。與進度週報整合需定 **聚合規則** 與 **與 manual/calculated 優先序**。 |
| 累計實際 % 計算時機 | 規格已定 **不存 %** → 建議 **讀取時即時計算**（列表／圖表／API）；若效能問題再快取 Redis 或 materialized view（後續）。 |
| 刪減已部分完工工項（分子） | 現無對應自動流程；需 **workflow／旗標** 與產品確認，與 PCCES 換版／軟刪工項政策一致。 |
| 圖表預設顯示計畫線 | 前端可預設 **baseline + 最新版**，其餘勾選；與後端 `plans[]` 預設值一致即可。 |
| 底表實際欄位 diary | 第二階段：**週 key 對齊 `log_date` 週** + 從 `ConstructionDailyLogWorkItem` 聚合 `daily_qty` 或讀主檔 `actualProgress`（需避免與 manual 重複計算）。 |

---

## 7. 建議開發順序（在現有程式庫上的微調）

規格書 Phase 1–3 仍適用，建議附加：

1. **Prisma**：新表 + soft-delete + 與 `Project` 關聯；**不要**與現有 `Pcces*` 強耦合直到產品選定整合策略。
2. **API**：掛在 `projects.ts` 下新 router；Zod schema 放 `src/schemas/`。
3. **權限**：新增 `construction.progress`（名稱可再議）並寫入種子／後台模組列表。
4. **前端**：新 view + **安裝 d3**（若採規格）+ 路由／側欄／麵包屑。
5. **與日誌／PCCES**：Phase 3 接 `diary` 與「數量推 %」時，再開 **對照文件** 定義週期邊界與版本選擇（永遠最新核定版 vs 歷史版）。

---

## 8. 參考檔案（現有程式）

| 用途 | 路徑 |
|------|------|
| 專案與工期展示 | `prisma/schema.prisma` → `Project`、`ProjectScheduleAdjustment` |
| PCCES 版本與工項 | `prisma/schema.prisma` → `PccesImport`、`PccesItem`、`PccesItemChange` |
| 施工日誌與預定 % 計算 | `src/modules/construction-daily-log/construction-daily-log.service.ts`（`computePlannedProgressPercent`） |
| 專案子路由掛載 | `src/routes/projects.ts` |
| 權限模組 id | `src/constants/permission-modules.ts`（後端）、`construction-dashboard-frontend/src/constants/permission-modules.ts` |
| 儀表板進度 KPI（未串接） | `construction-dashboard-frontend/src/composables/useDashboardKpi.ts` |

---

*文件產生方式：對照 2025-03 時點之 workspace 原始碼與使用者提供之規格書；若後續 schema 或路由有變更，請同步更新本文件。*
