# 估驗計價：請款快照與歷史口徑

本文說明 **估驗計價（construction valuation）** 在「已請款／契約單價／後續 PCCES 換版」下的資料與 API 行為，與施工日誌、PCCES 選取器的關係。

## 核心原則

1. **已請款是歷史事實**  
   每一期估驗寫入 DB 的 **`construction_valuation_lines.current_period_qty`** 與 **`unit_price`** 代表該期「本次請款」所用的數量與單價。全專案「已請款金額」為各期、各列 **`current_period_qty × unit_price`** 的加總（僅含未軟刪之主檔）。  
   **不會**因日後核定新版 PCCES、目錄單價變高，就自動回溯改寫 DB 裡舊估驗列的單價或金額。

   **明細 API 之（七）本次止累計估驗金額**：為 **`priorBilledAmount`（他次估驗依 itemKey 跨版加總之歷史 Σ 本次金額）＋本期 `current_period_qty×unit_price`**，**不是**「累計估驗數量×當前列單價」，以免換版後新單價回乘前期數量而改寫歷史請款面額。欄位 **`priorBilledAmount`** 與 **`priorBilledQty`** 一併回傳供前端對照。

2. **明細契約欄位以快照寫入（normalize）**  
   建立／更新估驗時，`normalizeValuationBody` 對 **綁定 `pccesItemId` 的列**：**項次、說明、單位、契約數量、變更後核定數量、單價、`path`** 均以 **請求 body** 為準寫入，**不再**以「目前最新核定版 `PccesItem`」覆寫（避免儲存當下被換成新價）。  
   仍會用最新版樹驗證：工項須為**末層**、`itemKind` 是否允許填本次數量等。

3. **更新時鎖定已存檔之 PCCES 單價**  
   **PATCH** 更新估驗時，若請求中仍包含某筆已存在之 **`pccesItemId`**，其 **`unitPrice`** 必須與 DB 已存值 **Decimal 相等**，否則回 **400**，`error.code`：**`VALUATION_UNIT_PRICE_IMMUTABLE`**。  
   - 同一張單**新帶入**的 PCCES 列（先前沒有該 `pccesItemId`）不在此限，可依當次選取快照寫入單價。  
   - **純手填列**（無 `pccesItemId`）不在此鎖定範圍。

4. **與「最新版」的關係**  
   - **`pccesItemId`** 語意上仍指向**目前最新核定樹**上的列 id（跨版彙總 prior／日誌時依 `itemKey` 延續）。  
   - **顯示與請款乘積**以 **DB 明細快照** 為準，與「若用今日目錄重算會是多少」可以不同；此為刻意設計，以符合「估驗日尚未到契約變更生效」等情境。

## 列表頁 KPI：`GET .../construction-valuations/summary`

供前端 StateCard 使用（需 `construction.valuation` read）：

| 欄位 | 意義 |
|------|------|
| `billedAmountTotal` | 全專案各估驗單各列 **本次數量×單價** 加總（與 DB 快照一致）。 |
| `contractBillableCapTotal` | 最新核定 PCCES **結構末層** Σ(契約數量×單價)；作為請款進度分母參考。 |
| `workDoneAtPriceTotal` | 同上末層 Σ(min(契約數量, 日誌截至今日累計)×單價)；**不含**純手填列之施作面。 |
| `unbilledAmount` | `max(0, workDoneAtPriceTotal − billedAmountTotal)`。 |
| `billingProgress` | `billedAmountTotal / contractBillableCapTotal`（0–100%，上限截斷）；無上限時 `null`。 |

手填列請款會進 `billedAmountTotal`，但未進 `workDoneAtPriceTotal` 時，可能使「尚未請款」在數學上被壓成 0；屬已知語意，列表頁副標已說明。

## 錯誤碼（節選）

| `code` | 情境 |
|--------|------|
| `VALUATION_UNIT_PRICE_IMMUTABLE` | 更新估驗時變更已存在 PCCES 列之單價。 |
| `VALUATION_QTY_EXCEEDED` | 本次＋前期已估驗超過日誌累計與契約上限等。 |
| `PCCES_NOT_APPROVED` | 專案無核定 PCCES 卻綁定工項。 |

## 相關程式

- `src/modules/construction-valuation/construction-valuation.service.ts` — `normalizeValuationBody`、`getListSummary`、`update`
- `src/modules/construction-valuation/construction-valuation.repository.ts` — `sumAllCurrentPeriodAmountsByProject`、`sumCurrentPeriodAmountByPccesItemsExcludingValuation`
- `src/schemas/construction-valuation.ts` — 明細 Zod

## API 速查

見 `docs/backend-prisma-api.md` 估驗計價小節（含 `summary`、`pcces-lines`）。
