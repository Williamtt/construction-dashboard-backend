# WBS 資源與變動成本設計

## 需求摘要

- **資源欄位**：下拉、依「人／機／料」分組、可搜尋、多選
- **開始、工期欄位**：已有，需保留並可編輯
- **變動成本**：由資源與用量計算得出

---

## 現狀

| 項目 | 狀態 |
|------|------|
| WbsNode | 已有 `startDate`、`durationDays`（結束日 = 開始 + 工期，推算） |
| WbsNodeResource | WBS 節點 ↔ 專案資源多對多，僅關聯 id |
| ProjectResource | 已有 `type`（labor \| equipment \| material）、`unit`、`unitCost` |

資源多選與開始／工期在 API 與前端的支援已存在；缺少的是「每筆資源的用量」與「變動成本」的計算與儲存。

---

## 設計結論

### 1. 資源欄位（人／機／料、可搜尋多選）

- **後端**：不改資源庫結構。`ProjectResource.type` 已為 `labor | equipment | material`（對應 人／機／料），WBS 列表／詳情回傳資源時一併回傳 `type`、`unit`、`unitCost`，必要時可回傳 `quantity`（見下）。
- **前端**：資源選擇改為「下拉 + 依 type 分組（人／機／料）+ 可搜尋、多選」；可選用現有專案資源 API，依 `type` 分組顯示。
- **WbsNodeResource**：新增 **用量** `quantity`（見下），以便計算變動成本並在畫面上顯示「每資源用量」。

### 2. 開始、工期

- 維持 `WbsNode.startDate`、`WbsNode.durationDays`，結束日由後端或前端依「開始 + 工期」推算，不需新增欄位。

### 3. 變動成本

- **公式**：變動成本 = Σ (資源單位成本 × 該節點使用該資源的用量)
- **WbsNodeResource** 新增欄位：
  - `quantity`（Decimal，預設 1）：該 WBS 節點使用該資源的數量（單位依 `ProjectResource.unit`，如人天、台、噸）。
- **WbsNode** 新增欄位（冗餘、方便查詢與報表）：
  - `variableCost`（Decimal，可選）：由後端在寫入／更新資源或工期時計算並寫入，公式 = Σ (resource.unitCost × link.quantity)。

計算時機：在 **create/update WBS 節點** 或 **設定資源／用量** 時，依當時的 `resourceLinks`（含 quantity）與 `ProjectResource.unitCost` 計算總和，寫回 `WbsNode.variableCost`。

### 4. API 行為

- **列表／樹狀**：每個節點回傳 `resources` 為 `{ id, name, type, unit, unitCost, quantity }[]`，並回傳 `variableCost`（可為 null）。
- **新增／更新節點**：body 支援 `resourceAssignments?: { resourceId: string, quantity?: number }[]`；若只傳 `resourceIds: string[]`，則視為 quantity 皆 1（向後相容）。

---

## 資料表變更

| 表 | 欄位 | 型別 | 說明 |
|----|------|------|------|
| **wbs_node_resources** | quantity | Decimal? 預設 1 | 該節點使用該資源的用量 |
| **wbs_nodes** | variable_cost | Decimal? | 變動成本（由後端計算後寫入） |

---

## 前端資源下拉（人／機／料、可搜尋多選）

- 呼叫既有的「專案資源列表」API，取得 `type`、`name`、`unit`、`unitCost`。
- 依 `type` 分組顯示為「人」「機」「料」三區塊（或單一列表加 type 標籤）。
- 使用可搜尋的多選元件（如 Combobox 或 Select 多選 + 搜尋），選到的資源在 WBS 新增／編輯時以 `resourceAssignments: [{ resourceId, quantity }]` 送出。
- 若 API 尚未回傳 `quantity`，前端可預設 1，之後再支援編輯用量。

---

## 實作順序建議

1. ~~資料庫：新增 `wbs_node_resources.quantity`、`wbs_nodes.variable_cost`（migration）~~ ✅ 已完成
2. ~~後端：WBS repo/service 讀寫 quantity、計算並寫入 variableCost；API 回傳 resources（含 type、quantity）、variableCost；create/update 接受 resourceAssignments~~ ✅ 已完成
3. 前端：WBS 表單／列表顯示開始、工期、變動成本；資源選擇改為分組（人／機／料）＋搜尋多選；若有用量欄位則一併編輯並帶入 API（body 可用 `resourceAssignments: [{ resourceId, quantity }]`，或沿用 `resourceIds` 視為 quantity 1）
