# 檔案上傳：架構、API 與實作說明

本文件為 Construction Dashboard 檔案上傳功能的規格與實作指南，涵蓋儲存架構（開發／產品）、傳統與切片上傳、API、權限與配額、清理機制，以及與監測／契約等業務的整合方式。

---

## 目錄

1. [概述與限制](#一概述與限制)
2. [架構設計](#二架構設計)
3. [儲存層（開發 vs 產品）](#三儲存層開發-vs-產品)
4. [上傳方式與流程](#四上傳方式與流程)
5. [API 說明](#五api-說明)
6. [資料模型](#六資料模型)
7. [權限與配額](#七權限與配額)
8. [租戶總檔案限制機制](#八租戶總檔案限制機制)
9. [前端使用方式](#九前端使用方式)
10. [後端實作要點](#十後端實作要點)
11. [清理與儲存佈局](#十一清理與儲存佈局)
12. [業務情境：監測與契約](#十二業務情境監測與契約)
13. [已知問題與改進](#十三已知問題與改進)
14. [附錄](#十四附錄)

---

## 一、概述與限制

### 1.1 功能概述

- **傳統上傳**：單檔小於閾值（預設 5MB），單次 POST 完整檔案至 `POST /api/v1/files/upload`。
- **切片上傳**：單檔 ≥ 5MB 且 ≤ 50MB，流程為：`POST /api/v1/files/chunked/init` → 多次 `POST /api/v1/files/chunked/upload/:uploadId` → `POST /api/v1/files/chunked/merge/:uploadId` 建立檔案記錄。
- **檔案去重**：依 SHA-256 Hash 與 `projectId` 去重，同一專案內相同檔案只存一份實體，可建立多筆附件記錄指向同一實體。
- **儲存抽象**：開發可用本地磁碟，產品用 Cloudflare R2（S3 相容），同一套 API 與業務邏輯，僅以環境變數切換。
- **權限與配額**：依專案成員權限上傳；可依 Tenant 的 `fileSizeLimitMb`、`storageQuotaMb` 限制單檔與總儲存量。

### 1.2 限制與常數

| 項目 | 值 | 常數／說明 |
|------|-----|------------|
| 傳統／切片閾值 | 5MB | `CHUNKED_UPLOAD_THRESHOLD_BYTES`（前後端一致） |
| 切片上傳單檔上限 | 50MB | `CHUNKED_UPLOAD_MAX_TOTAL_BYTES` |
| 每片大小 | 2MB | `CHUNKED_UPLOAD_CHUNK_SIZE` |
| 切片會話過期 | 24 小時 | `CHUNKED_UPLOAD_EXPIRY_HOURS` |
| 傳統上傳單檔上限 | 依 env 或 Tenant | `UPLOAD_MAX_FILE_SIZE` 或 Tenant.fileSizeLimitMb |

常數建議定義於後端 `src/constants/file.ts`；前端對應常數置於 `src/constants/file.ts`，數值與後端一致。

### 1.3 相關檔案清單（規劃）

| 角色 | 檔案 |
|------|------|
| 後端儲存抽象 | `src/lib/storage/types.ts`、`local.ts`、`r2.ts`、`index.ts` |
| 後端常數 | `src/constants/file.ts` |
| 後端切片服務 | `src/modules/file/chunked-upload.service.ts` |
| 後端切片控制器 | `src/modules/file/chunked-upload.controller.ts` |
| 後端傳統上傳與 merge 後建檔 | `src/modules/file/file.service.ts`、`file.controller.ts` |
| 上傳中介軟體 | `src/middleware/upload.ts` |
| 路由 | `src/routes/files.ts`（或併入既有 routes） |
| 前端常數 | `src/constants/file.ts` |
| 前端上傳工具 | `src/utils/upload.ts`（`uploadFile`） |
| 前端檔案 API | `src/api/files.ts`（或依專案 API 結構） |

---

## 二、架構設計

### 2.1 整體架構

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端層                                    │
├─────────────────────────────────────────────────────────────────┤
│  各業務 View（契約管理、監測上傳等）                               │
│  → 呼叫 uploadFile(projectId, file, category, onProgress)         │
├─────────────────────────────────────────────────────────────────┤
│  src/utils/upload.ts :: uploadFile                                │
│  - file.size < 5MB → POST /api/v1/files/upload (FormData)         │
│  - file.size ≥ 5MB → chunkedInit → uploadChunk 迴圈 → merge      │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                         API 層                                    │
├─────────────────────────────────────────────────────────────────┤
│  POST /api/v1/files/upload              傳統上傳（單檔）          │
│  POST /api/v1/files/chunked/init        初始化切片上傳            │
│  POST /api/v1/files/chunked/upload/:uploadId  上傳單一切片        │
│  POST /api/v1/files/chunked/merge/:uploadId   合併並建立附件記錄  │
│  GET  /api/v1/files/chunked/status/:uploadId  查詢上傳狀態        │
│  GET  /api/v1/files/:id                  取得檔案／下載           │
│  GET  /api/v1/projects/:projectId/files  專案附件列表             │
│  DELETE /api/v1/files/:id                刪除附件                 │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                        後端層                                    │
├─────────────────────────────────────────────────────────────────┤
│  file.controller     傳統上傳、取得、刪除、列表                   │
│  chunkedUpload.controller  init / uploadChunk / merge / status   │
│  chunkedUpload.service  會話（Map 或 Redis）、temp 切片、merge    │
│  file.service        uploadFile、uploadFileFromBuffer、去重、     │
│                      寫入儲存層、建立 Attachment 記錄             │
│  storage (抽象)      upload() / getUrl() / delete()               │
│                      → local 實作 或 R2 實作                      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 資料與儲存分離

- **PostgreSQL**：存放附件 metadata（id、projectId、tenantId、storageKey、fileName、fileSize、mimeType、fileHash、category、uploadedById、createdAt）。列表、權限、配額計算皆以 DB 為準。
- **實體檔案**：經由儲存抽象層寫入，key 建議為 `{tenantId}/{projectId}/{uuid}_{filename}`，避免撞名並利於依專案／租戶做生命週期管理。
- **Temp 切片**：可僅寫本地 `uploads/temp/{uploadId}/`，merge 時讀取後再經儲存層寫入正式位置；若需多機一致可改為 temp 也走儲存抽象（如 R2 的 `temp/` prefix），並由定時任務清理。

---

## 三、儲存層（開發 vs 產品）

### 3.1 抽象介面

建議在 `src/lib/storage/` 定義統一介面，例如：

- `upload(buffer: Buffer, key: string, contentType?: string): Promise<void>`
- `getUrl(key: string, options?: { download?: boolean }): Promise<string>` 或同步回傳路徑（本地時可回相對路徑，由後端 proxy）
- `delete(key: string): Promise<void>`
- `get(key: string): Promise<Buffer>`（可選，用於 merge 時讀取或後端 proxy 下載）

### 3.2 實作

| 環境 | 實作 | 環境變數 | 說明 |
|------|------|----------|------|
| 開發 | `LocalFileStorage` | `FILE_STORAGE_TYPE=local`、`FILE_STORAGE_LOCAL_PATH=./storage` | 寫入專案目錄，getUrl 可回 `/api/v1/files/:id` 由後端讀檔回傳 |
| 產品 | `R2Storage`（S3 相容） | `FILE_STORAGE_TYPE=r2`、`R2_*`（既有） | 使用 Cloudflare R2；getUrl 可回 presigned URL 或 R2_PUBLIC_URL + key |

`index.ts` 依 `FILE_STORAGE_TYPE` 匯出對應實例，業務層僅依賴介面，不直接依賴 local/r2。

### 3.3 正式檔 Key 命名

建議格式：`{tenantId}/{projectId}/{uuid}_{sanitizedFilename}`，例如：

- `tn_01/proj_01/clr123456_report.pdf`
- 可選：依日期分目錄 `{tenantId}/{projectId}/{YYYY}/{MM}/{uuid}_{filename}` 以利歸檔與清理策略。

---

## 四、上傳方式與流程

### 4.1 選擇規則

- **檔案 < 5MB**：傳統上傳（單次 `POST /api/v1/files/upload`，FormData 帶 `file`、`projectId`、`category`）。
- **檔案 ≥ 5MB 且 ≤ 50MB**：切片上傳（init → 多個 chunk → merge）。

前端由 `uploadFile` 依 `file.size` 與 `CHUNKED_UPLOAD_THRESHOLD_BYTES` 自動選擇。

### 4.2 傳統上傳流程

1. 前端：選擇檔案（< 5MB）→ 呼叫 `uploadFile` → `POST /api/v1/files/upload`，FormData：`file`、`projectId`、`category`（可選 `businessId`）。
2. 後端：驗證專案成員權限、Tenant 單檔／總量配額 → 計算 SHA-256 → 依 projectId + hash 去重或寫入儲存層 → 建立 Attachment 記錄 → 回傳 `{ data: { id, fileName, fileSize, url, ... } }`。
3. 前端：收到結果，`onProgress(100)`。

### 4.3 切片上傳流程

1. 前端：選擇檔案（≥ 5MB）→ `uploadFile` 走切片流程。
2. 前端：`POST /api/v1/files/chunked/init`，body：`{ filename, totalSize, mimeType, projectId, category? }`。
3. 後端：驗證大小（≤ 50MB）、類型、專案權限、配額 → 建立會話（Map 或 Redis）→ 回傳 `{ data: { uploadId, chunkSize } }`。
4. 前端：依 chunkSize 將 file 切為多個 Blob，依序（或並發）`POST /api/v1/files/chunked/upload/:uploadId`，multipart：`chunk`、`chunkIndex`。
5. 後端：每片寫入 `uploads/temp/{uploadId}/chunk_{index}`（或儲存抽象 temp key）。
6. 前端：全部完成後 `POST /api/v1/files/chunked/merge/:uploadId`，body：`{ projectId, category?, businessId? }`。
7. 後端：合併切片 → 計算 Hash → 去重或寫入儲存層（正式 key）→ 建立 Attachment 記錄 → 清理 temp 與會話。
8. 前端：收到附件記錄，`onProgress(100)`。

---

## 五、API 說明

基底路徑：`/api/v1`。成功回應格式：`{ data, meta? }`；錯誤：`{ error: { code, message } }`（見專案 API 契約）。

### 5.1 傳統上傳

- **端點**：`POST /api/v1/files/upload`
- **請求**：`multipart/form-data`
  - `file`（必填）
  - `projectId`（必填）
  - `category`（選填，如 `contract`、`monitoring_import`、`general`）
  - `businessId`（選填）
- **回應**：`{ data: { id, projectId, fileName, fileSize, mimeType, storageKey, url, createdAt } }`

### 5.2 切片上傳

| 方法 | 路徑 | 說明 |
|------|------|------|
| POST | `/api/v1/files/chunked/init` | 初始化上傳會話 |
| POST | `/api/v1/files/chunked/upload/:uploadId` | 上傳單個切片 |
| POST | `/api/v1/files/chunked/merge/:uploadId` | 合併切片並建立附件記錄 |
| GET | `/api/v1/files/chunked/status/:uploadId` | 查詢上傳狀態 |

**init 請求體（JSON）**：

```json
{
  "filename": "example.pdf",
  "totalSize": 10485760,
  "mimeType": "application/pdf",
  "projectId": "proj_xxx",
  "category": "contract"
}
```

**init 回應**：`{ data: { uploadId, chunkSize } }`

**upload**：`multipart/form-data`，欄位 `chunk`、`chunkIndex`（非負整數）。

**merge 請求體（JSON）**：`{ projectId, category?, businessId? }`

**merge 回應**：與傳統上傳相同，`{ data: { id, fileName, fileSize, url, ... } }`

**status 回應**：`{ data: { uploadId, totalChunks, uploadedChunks, totalSize, complete } }`；會話過期則 404。

### 5.3 取得檔案與列表

- **取得／下載**：`GET /api/v1/files/:id`（可加 `?download=true` 觸發下載、`?thumbnail=true` 取縮圖，若實作縮圖）。
- **專案附件列表**：`GET /api/v1/projects/:projectId/files`，query：`page`、`limit`、`category`（選填），回傳 `{ data: [...], meta: { page, limit, total } }`。
- **刪除**：`DELETE /api/v1/files/:id`（需為專案成員或依業務規則）。

---

## 六、資料模型

### 6.1 Attachment 表（建議 Prisma model）

需新增一表存放附件 metadata，與實體儲存分離。建議欄位：

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | String (cuid) | 主鍵 |
| projectId | String | 專案 ID |
| tenantId | String? | 租戶 ID（可從 Project 帶入，方便配額） |
| storageKey | String | 儲存層中的 key |
| fileName | String | 原始檔名 |
| fileSize | Int (Long) | 位元組 |
| mimeType | String | MIME 類型 |
| fileHash | String? | SHA-256，用於去重 |
| category | String? | contract / monitoring_import / general 等 |
| businessId | String? | 關聯業務 ID（可選） |
| uploadedById | String | 上傳者 User id |
| createdAt | DateTime | 建立時間 |

關聯：`Project`、`User`（uploadedBy）、可選 `Tenant`。刪除時可選：實體檔僅在「無其他 Attachment 指向同一 storageKey」時刪除（若實作去重共用實體）。

### 6.2 去重邏輯

- 寫入前以 `projectId` + `fileHash` 查詢是否已有相同實體（同一 storageKey 或同一 fileHash 的記錄）。
- 若存在：建立新 Attachment 記錄指向同一 `storageKey`（或同一實體檔），不重複寫入儲存層。
- 若不存在：寫入儲存層、建立一筆 Attachment。

---

## 七、權限與配額

### 7.1 權限

- 上傳、列表、下載、刪除皆需為該 **專案成員**（ProjectMember）；依 JWT 取得 userId，查詢 `projectId` 是否在 ProjectMember 中。
- 若專案屬 Tenant，可依 Tenant 狀態（如 suspended）拒絕上傳。

### 7.2 配額（Tenant）

- **單檔**：Tenant.fileSizeLimitMb（若設定），上傳前檢查 `file.size`。
- **總量**：Tenant.storageQuotaMb（若設定），上傳前查詢該 tenant 計入配額的總儲存量，加上本檔後不得超過配額。
- 超出時回傳 403，`error.code` 如 `FILE_SIZE_EXCEEDED` 或 `STORAGE_QUOTA_EXCEEDED`，`message` 明確說明單檔或總量超限。

詳細計算方式、檢查時機、去重與刪除對配額的影響、以及「取得目前使用量」API 見 [§8 租戶總檔案限制機制](#八租戶總檔案限制機制)。

---

## 八、租戶總檔案限制機制

本節說明 **Tenant.storageQuotaMb**（租戶總儲存上限，單位 MB）與 **Tenant.fileSizeLimitMb**（單檔上限，單位 MB）的計算方式、檢查時機、邊界情境與 API 設計，供實作與前後端對接使用。

### 8.1 配額維度與資料來源

| 維度 | 欄位 | 單位 | 說明 |
|------|------|------|------|
| 單檔上限 | Tenant.fileSizeLimitMb | MB | 單一檔案不得超過此大小；`null` 表示不限制（或沿用系統預設，如 50MB）。 |
| 總量上限 | Tenant.storageQuotaMb | MB | 該租戶「計入配額的總儲存量」不得超過此值；`null` 表示不限制。 |

**計入總量的資料來源**：以 **Attachment 表** 為準，只計算「該租戶下、且對應到唯一實體檔」的體積，避免重複計算去重後的同一實體。實作上可採用下列兩種方式之一：

- **方案 A（依記錄加總，再扣去重）**：  
  `currentUsageBytes = SUM(Attachment.fileSize WHERE tenantId = ?)`。  
  若實作去重時「多筆 Attachment 指向同一 storageKey」只存一份實體，則同一實體會被多筆記錄加總，總量會高估。因此更建議採用方案 B。

- **方案 B（依實體檔唯一 key 加總，推薦）**：  
  先依 `tenantId` 篩選 Attachment，再依 `storageKey`（或 `fileHash`）做唯一實體去重，只加總每個唯一實體一次的 `fileSize`。  
  即：`currentUsageBytes = SUM(DISTINCT ON (storageKey) fileSize WHERE tenantId = ?)` 或等價的「依 storageKey 分組取一筆再 SUM(fileSize)」。  
  這樣去重上傳不會重複佔用配額，與實際儲存體用量一致。

若第一版實作尚未做「多筆記錄指向同一實體」的去重，則可先採方案 A，待引入去重後再改為方案 B。

### 8.2 檢查時機

| 操作 | 單檔檢查（fileSizeLimitMb） | 總量檢查（storageQuotaMb） |
|------|-----------------------------|-----------------------------|
| 傳統上傳 `POST /files/upload` | 上傳前：`file.size <= fileSizeLimitMb * 1024 * 1024` | 上傳前：`currentUsageBytes + file.size <= storageQuotaMb * 1024 * 1024` |
| 切片 init `POST /files/chunked/init` | 依 `totalSize` 檢查 | 依 `totalSize`：`currentUsageBytes + totalSize <= storageQuotaMb * 1024 * 1024` |
| 切片 merge `POST /files/chunked/merge` | 已在 init 檢查，可不再檢查 | 可選擇在 merge 時再驗證一次（防止 init 後配額被其他上傳佔滿）；若 init 與 merge 間隔短，亦可僅在 init 檢查。 |

- **無租戶情境**：若專案未關聯 Tenant（`project.tenantId` 為 null），則不套用租戶配額，僅可選套用系統預設單檔上限（如 50MB）。
- **未設定配額**：`storageQuotaMb` 或 `fileSizeLimitMb` 為 `null` 時，該項視為不限制。

### 8.3 總量計算：去重與刪除的影響

- **上傳且去重**：若新上傳的檔案 Hash 與該租戶內既有實體相同，只新增 Attachment 記錄、不新增實體檔，則 **總量不增加**，無需佔用配額。
- **上傳且未去重**：新增實體檔 + 一筆 Attachment，總量增加 `file.size`。
- **刪除附件**：使用者刪除一筆 Attachment 時：
  - 若該 `storageKey` 仍有其他 Attachment 引用（去重共用），則只刪除該筆記錄，**不刪實體檔、不釋放配額**。
  - 若該 `storageKey` 已無其他引用，則刪除實體檔並自「計入配額的總量」中扣除此檔的 `fileSize`（即釋放配額）。

因此刪除邏輯需：查詢同一 `storageKey` 的 Attachment 數量；若僅一筆則刪除實體檔並更新配額統計（或下次查詢時以方案 B 自然反映）；若多筆則僅刪除該筆記錄。

### 8.4 取得目前使用量（供前端／管理後台顯示）

可提供 API 讓租戶管理員或前端顯示「已用 / 上限」：

- **建議端點**：`GET /api/v1/tenants/:tenantId/storage-usage` 或 `GET /api/v1/admin/tenants/:tenantId/storage-usage`（依現有權限設計擇一）。  
  或由「專案所屬租戶」帶出：在專案或檔案相關 API 的 response 中帶入 `storageUsageBytes`、`storageQuotaBytes`（若為 null 則表示不限制）。

- **回應範例**：
```json
{
  "data": {
    "tenantId": "tn_01",
    "usageBytes": 104857600,
    "usageMb": 100,
    "quotaMb": 500,
    "quotaBytes": 524288000
  }
}
```
若 `quotaMb` 為 `null`，可省略或回傳 `null`，前端解讀為「不限制」。

- **計算方式**：與 8.1 一致，依 Attachment 表、tenantId、並以 storageKey 去重後加總 fileSize（方案 B）。

### 8.5 錯誤回應（配額超限）

當單檔或總量超限時，建議回傳 **403 Forbidden**，並以明確錯誤碼與訊息方便前端區分：

| 情境 | error.code | 建議 message（可調整文案） |
|------|------------|-----------------------------|
| 單檔超過 fileSizeLimitMb | FILE_SIZE_EXCEEDED | 單一檔案不得超過 {fileSizeLimitMb} MB |
| 總量超過 storageQuotaMb | STORAGE_QUOTA_EXCEEDED | 儲存空間已達上限（已用 {usageMb} MB / 上限 {quotaMb} MB） |

前端可依 `error.code` 顯示不同提示或引導使用者刪除舊檔、聯繫管理員提升配額等。

### 8.6 實作要點小結

1. **Repository / Service**：提供 `getTenantStorageUsageBytes(tenantId: string): Promise<number>`，依 8.1 方案 A 或 B 查詢。
2. **上傳前**：在傳統上傳與 chunked init 中取得 `tenantId`（由 projectId 帶出）、Tenant 的 `fileSizeLimitMb` / `storageQuotaMb`，呼叫上述 usage 取得當前總量，再判斷單檔與總量是否允許；不允許則拋出 AppError(403, 'FILE_SIZE_EXCEEDED' | 'STORAGE_QUOTA_EXCEEDED', message)。
3. **刪除時**：刪除 Attachment 後，若該 storageKey 已無其他記錄，再刪除實體檔並可選更新快取或統計（若未來有做 usage 快取）。
4. **無租戶**：project.tenantId 為 null 時跳過租戶配額與單檔限制（或僅套用系統預設單檔上限）。

---

## 九、前端使用方式

### 9.1 統一工具 uploadFile（建議）

所有上傳透過 `src/utils/upload.ts` 的 `uploadFile`，依檔案大小自動選擇傳統或切片：

```typescript
import { uploadFile } from '@/utils/upload'

const result = await uploadFile({
  file,
  projectId: route.params.projectId,
  category: 'contract',
  onProgress: (progress) => { /* 0–100 */ },
})
// result: { id, fileName, fileSize, url, ... }
```

參數建議：`file`、`projectId`、`category`、`businessId?`、`onProgress?`、`concurrency?`（切片並發數）。內部依 `file.size` 與 `CHUNKED_UPLOAD_THRESHOLD_BYTES` 選擇路徑，並呼叫對應 API（`API_PATH.FILES_UPLOAD`、`FILES_CHUNKED_INIT` 等）。

### 9.2 常數對齊

前端 `src/constants/file.ts` 定義與後端相同的閾值與上限（如 5MB、50MB、2MB），避免行為不一致。

### 9.3 錯誤處理

- 401：未登入或 token 無效 → 導向登入。
- 403：無權限或配額不足 → 顯示錯誤訊息（如「儲存空間已達上限」）。
- 413：單檔過大。
- 切片失敗：可依 `status` 查詢已上傳切片數，支援重試或放棄。

---

## 十、後端實作要點

### 10.1 儲存層

- 實作 `LocalFileStorage`：寫入 `FILE_STORAGE_LOCAL_PATH`，檔名即 key 的相對路徑；getUrl 可回後端 proxy URL。
- 實作 `R2Storage`：使用 `@aws-sdk/client-s3`，endpoint 為 R2_ENDPOINT，bucket 為 R2_BUCKET_NAME；getUrl 可產生 presigned GET。

### 10.2 切片服務（chunked-upload.service）

- **initUpload(filename, totalSize, mimeType, projectId, category?)**  
  驗證大小 ≤ 50MB、類型白名單、專案權限、Tenant 配額；建立會話（Map 或 Redis），回傳 uploadId、chunkSize（2MB）。
- **uploadChunk(uploadId, chunkIndex, chunkBuffer)**  
  驗證會話存在、chunkIndex 合法；寫入 temp 目錄或 temp key。
- **mergeChunks(uploadId, projectId, userId, category?, businessId?)**  
  檢查切片齊全 → 合併為單一 Buffer → 計算 SHA-256 → 去重或呼叫 storage.upload() → 建立 Attachment → 清理 temp 與會話；失敗時在 catch 內同樣清理。
- **getUploadStatus(uploadId)**  
  回傳已上傳切片數、總數、complete；過期則刪除會話並回傳 404。
- **cleanupExpiredUploads()**  
  刪除過期會話與對應 temp 目錄（或 temp key），供定時任務呼叫。

### 10.3 上傳中介軟體

- 傳統上傳：`multer` 或類似，單檔大小限制（如 5MB），欄位名 `file`。
- 切片上傳：解析 multipart 欄位 `chunk`、`chunkIndex`，單片限制 2MB+ 小 buffer，內容放 `req.file.buffer` 或寫入 temp 後傳 path。

### 10.4 傳統上傳與 file.service

- **uploadFile(req.file, projectId, userId, category?, businessId?)**  
  讀取 buffer → 計算 Hash → 依 projectId + hash 查是否已有實體 → 若有則只建 Attachment 記錄，否則 storage.upload() 後再建記錄。需帶入 tenantId（從 Project 取得）以寫入 Attachment 並做配額計算。

---

## 十一、清理與儲存佈局

### 11.1 清理策略

| 情境 | 時機 | 動作 |
|------|------|------|
| Merge 成功 | 當次請求內 | 刪除 temp 目錄／temp key、刪除會話 |
| Merge 失敗 | catch 內 | 同上 |
| 從未呼叫 merge（放棄上傳） | 定時任務 | 每小時清理過期會話與對應 temp |

### 11.2 定時任務

- 排程：每小時整點（或依部署方式設定 cron）。
- 動作：呼叫 `chunkedUploadService.cleanupExpiredUploads()`。

### 11.3 儲存目錄結構（本地實作時）

```
storage/                    # 或 FILE_STORAGE_LOCAL_PATH
├── {tenantId}/
│   └── {projectId}/
│       └── {uuid}_{filename}   # 正式檔
uploads/
└── temp/                    # 切片暫存（僅後端可讀）
    └── {uploadId}/
        ├── chunk_0, chunk_1, ...
        └── (merge 時合併後可刪除)
```

R2 時可對應為 bucket 內 `{tenantId}/{projectId}/...` 與 `temp/{uploadId}/...`。

---

## 十二、業務情境：監測與契約

### 12.1 契約檔案（ContractManagementView）

- 使用一般檔案上傳：category 如 `contract`，可細分子分類（依前端選單）。
- 上傳後列表來自 `GET /api/v1/projects/:projectId/files?category=contract`，刪除用 `DELETE /api/v1/files/:id`。
- 前端已有多檔列表與上傳 UI，改為呼叫 `uploadFile` 與上述 API 即可。

### 12.2 監測數據上傳（MonitoringUploadView）

- **情境**：使用者上傳 Excel/CSV，系統解析後寫入監測歷史資料表（時序或統計）。
- **選項 A（僅解析）**：上傳檔不保留，僅在記憶體或暫存解析，寫入 DB 後刪除暫存；可選在 DB 記一筆「匯入紀錄」（時間、使用者、檔名、筆數）供稽核。
- **選項 B（解析 + 留檔）**：同上，但同時走一般檔案上傳流程，將 Excel 存成正式檔，category 如 `monitoring_import`，以便日後稽核或重新解析。
- 若採用選項 B，可複用同一套 `uploadFile` 與 Attachment 模型；解析邏輯在 merge 或傳統上傳成功後，由 service 層依 category 觸發。

---

## 十三、已知問題與改進

### 13.1 目前限制

- **會話儲存**：若使用 in-memory Map，多實例無法共享、重啟會丟失進行中會話；建議改為 Redis 並設定過期時間。
- **秒傳**：merge 時才計算 Hash，init 前無法做「檔案已存在則直接回傳」；可改為前端先算 Hash、init 時帶入，後端若有相同 projectId+hash 則直接回傳既有記錄。
- **縮圖**：圖片／PDF 縮圖可列為 Phase 2，本文件不強制實作。

### 13.2 改進建議（優先順序供參考）

1. **短期**：會話改存 Redis；上傳前檢查 Tenant 配額與單檔限制，錯誤碼明確。
2. **中期**：前端計算 Hash、init 時帶入，後端支援秒傳；斷點續傳（進度存 localStorage、失敗切片重試）。
3. **長期**：縮圖產生（圖片/PDF）；R2 生命週期規則清理過期 temp；稽核日誌（誰在何時上傳/刪除）。

---

## 十四、附錄

### 14.1 切片會話資料結構（後端）

```typescript
interface ChunkUploadSession {
  uploadId: string
  filename: string
  totalChunks: number
  uploadedChunks: Set<number>
  totalSize: number
  mimeType: string
  projectId: string
  category?: string
  createdAt: Date
  expiresAt: Date  // 24 小時後過期
}
```

### 14.2 環境變數摘要

| 變數 | 說明 |
|------|------|
| FILE_STORAGE_TYPE | `local` 或 `r2` |
| FILE_STORAGE_LOCAL_PATH | 本地儲存根目錄（開發） |
| R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_ENDPOINT, R2_PUBLIC_URL | R2 設定（產品） |

### 14.3 相關文件

- **backend-prisma-api.md**：專案 API 與 Prisma 使用方式。
- **.cursor/rules/api-contract.mdc**：API 成功／錯誤回應格式。
- **.cursor/rules/prisma-database.mdc**：Prisma 與資料庫規範。

---

*本文件為 Construction Dashboard 檔案上傳功能之規格與實作說明，整合專案儲存抽象、權限配額、傳統／切片上傳與清理機制。*
