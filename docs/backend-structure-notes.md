# 後端架構檢視與建議

> 路由與模組組織 · 錯誤處理一致性 · 可維護性  
> 版本 1.0　2026 年 3 月

---

## 一、目前架構總覽

整體結構與專案規範一致，**不算亂**：

| 層級 | 現狀 | 說明 |
|------|------|------|
| **入口** | `app.ts` → `/api/v1` 掛載 `apiRouter` | 單一入口、路徑清晰。 |
| **路由** | `routes/index.ts` 掛載各子 Router（auth、projects、admin、platform-admin 等） | 專案內路由依功能拆分；`projects` 下再掛 schedule-adjustments、albums 等，層級合理。 |
| **模組** | `modules/<resource>/` 內 controller → service → repository | 符合既有「模組化」約定，業務邏輯與 DB 分離。 |
| **共用** | `lib/`（db、mediamtx、storage、encryption）、`shared/`（errors、utils）、`middleware/` | 外部 API、DB、錯誤類別集中管理。 |

因此**大方向沒有問題**，無須大改。可加強的只有兩點：**錯誤處理一致性**、以及**過長路由檔的可讀性**（可選）。

---

## 二、建議改善項目

### 2.1 錯誤處理一致（已落實）

- **原則**：所有非同步路由處理函式應透過 `asyncHandler` 包裝，在邏輯內 `throw new AppError(...)`，由 `error-handler` 中間件統一回傳 `{ error: { code, message } }`。
- **原狀況**：`admin.ts`、`platform-admin.ts` 中部分 GET 使用 `async (req, res) => { try { ... } catch (e) { res.status(500).json(...) } }`，錯誤未經統一格式、也不利後續擴充（如 log、監控）。
- **作法**：已將該類路由改為使用 `asyncHandler`，並在 catch 中 `throw new AppError(500, 'INTERNAL_ERROR', '...')`，與其他 API 行為一致。

### 2.2 過長路由檔（可選，未來重構）

- **現狀**：`admin.ts`、`platform-admin.ts` 單檔行數較多，涵蓋多種資源（租戶、使用者、專案、設定等）。
- **建議**：若之後繼續擴充，可考慮：
  - 拆成多個路由檔，例如 `routes/admin/tenant.ts`、`routes/admin/users.ts`，再在 `admin.ts` 內 `router.use('/tenant-info', ...)` 或依路徑掛載；
  - 或將邏輯委派給 `modules/` 下的 controller，路由檔只做「解析參數 → 呼叫 controller → 回傳」，與 `projects.ts` 風格一致。
- **優先級**：非必須，現階段維持單檔即可；新功能（如氣象 API）依現有模組與路由方式加入即可。

---

## 三、新增功能時的慣例

- **外部 API**：在 `src/lib/` 新增 client（如 `cwa-client.ts`），從環境變數讀取 token，不對外暴露。
- **新資源**：在 `src/modules/<resource>/` 建 controller、service、repository（若需 DB），在 `routes/` 新增或擴充 Router 並於 `index.ts` 掛載。
- **錯誤**：一律使用 `asyncHandler` + `throw new AppError(...)`，避免在 handler 內直接 `res.status(500).json(...)`。

這樣後端架構可以保持清晰、一致，後續串接 CWA 氣象或其它 API 時也會好維護。
