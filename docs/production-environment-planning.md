# 正式環境建立規劃書

本文件為 **Construction Dashboard** 正式環境（Production）的建立與上線規劃，涵蓋架構、網域、環境變數、部署步驟、安全與維運要點。實作時可搭配 `production-release-checklist.md` 做發布前檢查。

**分支約定**：正式版以 **prod** 分支管理；Railway、Vercel 皆從 **prod** 部署。逐步操作請見 **`deployment-setup-guide.md`**。

---

## 一、目標與範圍

### 1.1 目標

- 建立可對外提供服務的正式環境，供租戶與使用者透過瀏覽器存取。
- 後端、前端、資料庫、檔案儲存、攝影機串流等元件皆在正式設定下正確運作。
- 安全與敏感設定（JWT、加密金鑰、CORS、DB）符合生產環境要求。

### 1.2 範圍

| 項目 | 說明 |
|------|------|
| 後端 API | Express + Prisma，部署於 **Railway** |
| 前端 SPA | Vue 3 + Vite，部署於 **Vercel** |
| 資料庫 | PostgreSQL（Railway 或自備） |
| 檔案儲存 | Cloudflare R2（S3 相容） |
| 攝影機串流 | mediamtx（可與 Backend 同機或獨立主機） |
| CI/CD | GitHub 觸發 Railway / Vercel 自動部署（可選） |

### 1.3 不在此規劃書的項目

- 開發／測試環境的建立（假設已有本機或 staging）。
- 多租戶產品功能差異或單租開關（見 `multi-tenant-and-product-gap-analysis.md`）。
- 攝影機功能之可選優化（path 自動註冊、傳輸速度顯示等，見 `production-release-checklist.md`）。

---

## 二、架構總覽

### 2.1 系統架構圖

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            使用者（瀏覽器）                               │
└─────────────────────────────────────────────────────────────────────────┘
         │ HTTPS                    │ HTTPS (API)              │ HTTPS (WebRTC)
         ▼                          ▼                          ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│  前端 (Vercel)   │        │ 後端 (Railway)   │        │ mediamtx 對外    │
│  Vue SPA        │───────▶│ Express API     │───────▶│ WebRTC / WHEP   │
│  VITE_API_URL   │        │ JWT / CORS      │  API   │ (可同機或獨立)   │
└─────────────────┘        └────────┬────────┘        └────────▲────────┘
                                    │                          │
                    ┌───────────────┼───────────────┐          │ RTMP
                    ▼               ▼               ▼          │
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┴──────────┐
            │ PostgreSQL   │ │ Cloudflare   │ │ 現場 go2rtc → RTMP 推流   │
            │ (Railway)    │ │ R2 (S3)     │ │ 安裝包內 rtmp 指向        │
            └──────────────┘ └──────────────┘ │ MEDIAMTX_PUBLIC_HOST     │
                                              └──────────────────────────┘
```

### 2.2 資料流簡述

- **網頁操作**：使用者 → 前端 (Vercel) → 後端 API (Railway) → PostgreSQL / R2。
- **登入**：前端取得 JWT，後續請求帶 `Authorization: Bearer <token>`。
- **攝影機**：後端管理 Camera 與 mediamtx path；播放時前端向 Backend 要 play-url（mediamtx WHEP），再連 mediamtx 取得 WebRTC 串流；現場 go2rtc 依安裝包設定向 mediamtx 推 RTMP。

---

## 三、費用規劃

本節整理各項服務的計費方式與約略月費，供預算與方案選擇參考。實際金額以各廠商最新定價與當月用量為準。

### 3.1 各服務計費概要

| 服務 | 用途 | 免費／試用 | 付費方案與約略月費 |
|------|------|------------|---------------------|
| **Railway** | 後端 API + 可選 PostgreSQL | 試用 $5 額度（免信用卡） | **Hobby**：月費 $5 起，含 $5 使用額度；超出部分依 CPU／記憶體／磁碟／出站流量按量計費。後端 + 小型 DB 常落在約 **$5～15/月**。 |
| **Vercel** | 前端 SPA 託管 | **Hobby 免費**（個人／非商業） | **Pro**：$20/使用者/月，適合商業與團隊；含較高 Edge 請求與流量額度。 |
| **Cloudflare R2** | 檔案儲存（S3 相容） | **免費額度**：10 GB 儲存/月、100 萬次 Class A、1,000 萬次 Class B；**出站免費** | 超出後：儲存約 $0.015/GB/月；Class A 約 $4.5/百萬次、Class B 約 $0.36/百萬次。小～中型用量常仍在免費內或 **$0～5/月**。 |
| **mediamtx** | 攝影機串流 | 開源、無授權費 | **與 Backend 同機**：無額外主機費（吃 Railway 資源）。**獨立主機**：需一台 VPS，約 **$5～12/月**（如 DigitalOcean、Linode 基本方案）。 |
| **網域**（可選） | 自訂網址 | 使用 `*.vercel.app`／`*.railway.app` 則 $0 | 自訂網域註冊約 **$10～15/年**（依註冊商而定）。 |

### 3.2 Railway 細項說明

- **方案**：Hobby 月付 $5，含 $5 使用額度；Pro 每席 $20/月，含 $20 額度。
- **計費**：按實際使用量（vCPU 分鐘、記憶體 GB 分鐘、磁碟 GB 小時、出站流量）。訂閱費可抵用，超出部分另計。
- **PostgreSQL**：可在同一專案新增 Railway 的 PostgreSQL 服務，其用量會計入同一帳單；或自備外部 DB（不計 Railway 費用）。
- 小型後端（1 個服務 + 1 個小型 DB）在輕量流量下，常見落在 **約 $5～15/月**；流量與常駐資源愈高，費用會上升。

### 3.3 Vercel 細項說明

- **Hobby（免費）**：個人、非商業用途；含一定額度之 Function 與 Edge 請求、流量。**商業用途需使用 Pro**。
- **Pro**：$20/使用者/月，含較高額度與團隊功能；超出額度後依使用量計費。
- 若本專案為**商業／正式對外服務**，建議將前端列為 **Pro** 預算（$20/月起）；若僅為內部或個人用途，可先以 Hobby 評估。

### 3.4 Cloudflare R2 細項說明

- **出站流量（Egress）免費**，與多數雲端儲存不同，適合檔案下載較多的情境。
- 免費額度：10 GB 儲存/月、100 萬次 Class A（寫入、List）、1,000 萬次 Class B（讀取）。
- 小規模正式環境（表單、附件、圖檔）常可落在免費額度內；若儲存與請求量較大，再以單價估算（見 3.1 表）。

### 3.5 情境預估（月費約略）

| 情境 | 說明 | 約略月費（USD） |
|------|------|------------------|
| **最小可行正式環境** | 後端 + DB 於 Railway（Hobby）、前端 Vercel Hobby、R2 免費額度、mediamtx 與 Backend 同機、使用預設網域 | **約 $5～10**（主要為 Railway） |
| **商業用、單一自訂網域** | 同上，但前端改 Vercel Pro、自訂網域（年費攤提約 $1～2/月） | **約 $26～32** |
| **攝影機獨立主機** | 上述商業用 + mediamtx 獨立 VPS | **約 $31～44** |

以上為參考區間，實際依流量、儲存、團隊人數與各廠商當期方案而定；上線前請至 Railway、Vercel、Cloudflare 官網確認最新定價。

### 3.6 成本控制建議

- 先用 **Railway 試用額度** 與 **Vercel Hobby** 驗證流程，再決定是否升級付費。
- 設定 **用量與預算告警**（Railway、Vercel、Cloudflare 若有提供）。
- R2 依需求設定生命週期或封存，避免無限期累積儲存。
- mediamtx 能與 Backend 同機則可省一台 VPS；若流量或穩定性要求高，再考慮獨立主機。

---

## 四、網域與 URL 規劃

### 4.1 建議命名

在規劃前先決定正式網址，以便設定 CORS、VITE_API_URL、MEDIAMTX_PUBLIC_HOST。以下為範例，請依實際網域替換：

| 用途 | 範例 URL | 說明 |
|------|----------|------|
| 前端（使用者入口） | `https://dashboard.your-domain.com` 或 Vercel 預設 `https://xxx.vercel.app` | 前端 SPA 網址 |
| 後端 API | `https://api.your-domain.com` 或 Railway 預設 `https://xxx.railway.app` | 後端根網址，前端 VITE_API_URL 指向此處 |
| 串流（mediamtx 對外） | `https://stream.your-domain.com` | WebRTC 播放與 go2rtc 推流用；須與 mediamtx 實際對外 host 一致 |

### 4.2 自訂網域（可選）

- **Vercel**：在專案 Settings → Domains 綁定自訂網域，並依指示設定 DNS。
- **Railway**：可綁定自訂網域或使用 Railway 提供的 `*.railway.app`。
- **mediamtx**：若獨立部署，需一台可綁定網域的機器或 Load Balancer，並以 Nginx/Caddy 等反代 8889，提供 https。

---

## 五、環境變數規劃

### 5.1 後端（Railway）

以下為正式環境**必設**與**建議**變數，請在 Railway 專案 → Service → Variables 中設定。

| 變數 | 必設 | 說明與正式環境建議值 |
|------|------|----------------------|
| `NODE_ENV` | 建議 | `production` |
| `PORT` | 否 | Railway 自動注入，通常不需手動設 |
| `DATABASE_URL` | ✅ | 正式 PostgreSQL 連線字串（Railway 或自備） |
| `JWT_SECRET` | ✅ | 強隨機值，例：`openssl rand -base64 32` |
| `JWT_REFRESH_SECRET` | ✅ | 另一組強隨機值，勿與 JWT_SECRET 相同 |
| `CORS_ORIGIN` | ✅ | 正式前端網址，一個；多個用逗號分隔，例：`https://dashboard.your-domain.com` |
| `ENCRYPTION_KEY` | ✅ | 設備 RTSP 加密用，32 字元 hex 或 44 字元 base64，例：`openssl rand -hex 16` 或 `openssl rand -base64 32` |
| `MEDIAMTX_API_URL` | ✅ | Backend 呼叫 mediamtx API 的 URL；同機：`http://127.0.0.1:9997`；不同機：`http://<mediamtx-host>:9997`（僅內網） |
| `MEDIAMTX_PUBLIC_HOST` | ✅ | 對外 WebRTC/RTMP base URL，**正式環境建議 https**，例：`https://stream.your-domain.com` |
| `MEDIAMTX_RTMP_PORT` | 可選 | 預設 1935，若 mediamtx 改用其他 port 再設 |
| `FILE_STORAGE_TYPE` | 建議 | 正式環境用 `r2`（若使用 R2）；開發可用 `local` |
| `FILE_STORAGE_LOCAL_PATH` | 條件 | 僅當 `FILE_STORAGE_TYPE=local` 時使用；正式通常用 R2 |
| `R2_ACCESS_KEY_ID` | 條件 | 當使用 R2 時必設 |
| `R2_SECRET_ACCESS_KEY` | 條件 | 當使用 R2 時必設 |
| `R2_BUCKET_NAME` | 條件 | 當使用 R2 時必設 |
| `R2_ENDPOINT` | 條件 | 當使用 R2 時必設（Cloudflare R2 endpoint URL） |
| `R2_PUBLIC_URL` | 條件 | 當使用 R2 且需對外存取檔案 URL 時設 |

### 5.2 前端（Vercel）

| 變數 | 必設 | 說明 |
|------|------|------|
| `VITE_API_URL` | ✅ | 正式後端 API 根網址，例：`https://api.your-domain.com`；建置時寫入，部署後前端會向此發送 API 請求 |

前端僅此一項與正式環境強相關；其餘依需求可加（例如 analytics、feature flags）。

### 5.3 mediamtx（若獨立部署）

- 設定檔中：`api: true`、`rtmp: true`、`webrtc: true`；port 1935（RTMP）、8889（WebRTC）、9997（API）。
- **9997 僅供 Backend 呼叫**，不對外開放。
- 若前端與 mediamtx 不同 domain，需設定 CORS / `webrtcAllowOrigins` 等允許前端 origin。
- 對外建議經 Nginx/Caddy 反代 8889，提供 **https**，並將該 https base URL 設為 Backend 的 **MEDIAMTX_PUBLIC_HOST**。

---

## 六、部署步驟規劃

### 6.1 階段一：資料庫與後端

1. **建立正式 PostgreSQL**
   - 若用 Railway：在專案中新增 PostgreSQL 服務，取得 `DATABASE_URL`。
   - 若自備：建立資料庫並取得連線字串。

2. **後端專案部署到 Railway**
   - 連線 GitHub repo（construction-dashboard-backend）。
   - Root 目錄：backend 專案根目錄。
   - Build 指令：`npm install && npx prisma generate && npm run build`。
   - Start 指令：`npm run start`（即 `node dist/index.js`）。
   - 設定所有 5.1 節後端環境變數（必設項務必填寫）。

3. **執行資料庫 migration**
   - 部署後在 Railway 的 Shell 或透過一次性的 Deploy 執行：`npx prisma migrate deploy`。
   - 若有 seed 需求，可再執行：`npm run db:seed`（若專案有定義）。

4. **驗證後端**
   - 呼叫 `GET /api/v1/health` 或等同健康檢查端點（若有）。
   - 以 Postman 或 curl 測試登入 API，確認 JWT 與 CORS 正常。

### 6.2 階段二：mediamtx（攝影機功能需要時）

1. **決定部署方式**
   - **與 Backend 同機（Railway）**：在 Build/Start 中一併下載並啟動 mediamtx，且需以單一對外 port 反代 Backend + mediamtx（例如 Nginx 依 path 分流）。
   - **獨立主機（建議）**：在 VPS 或另一台機器上執行 mediamtx，對外開放 1935（RTMP）、8889（WebRTC），9997 僅內網；並以 Nginx 反代 8889 提供 https。

2. **設定 MEDIAMTX_PUBLIC_HOST**
   - 設為 mediamtx 對外的 https base URL（與實際一致），後端與現場安裝包皆依此產生連線網址。

3. **驗證**
   - 後端能透過 `MEDIAMTX_API_URL` 呼叫 mediamtx API（path 新增等）。
   - 前端在正式環境可取得 play-url 並成功播放（需至少一台上線的攝影機或測試 path）。

### 6.3 階段三：前端

1. **前端專案部署到 Vercel**
   - 連線 GitHub repo（construction-dashboard-frontend）。
   - Build 指令：`npm run build`。
   - 在 Vercel 專案 Settings → Environment Variables 設定 `VITE_API_URL` = 正式後端 API 根網址。

2. **建置與發布**
   - 觸發建置（或 push 後自動建置），確認 `npm run build` 無錯誤。
   - 部署完成後以正式前端網址開啟，測試登入、專案列表、基本功能。

### 6.4 階段四：檔案儲存（R2）

1. 在 Cloudflare 建立 R2 bucket，取得 endpoint、access key、secret、bucket 名稱與公開存取 URL（若需）。
2. 在後端（Railway）設定 `FILE_STORAGE_TYPE=r2` 及所有 `R2_*` 變數。
3. 重新部署後端，測試檔案上傳與下載（依專案既有 API）。

### 6.5 階段五：端到端驗收

- 登入（含 refresh token 若實作）。
- 專案列表、進入專案、儀表板。
- 若有攝影機：新增攝影機、下載安裝包、現場 go2rtc 推流、儀表板即時畫面與狀態顯示。
- 若有檔案上傳：上傳與下載流程。
- 多租戶／權限：以不同角色（tenant_admin、project_user、platform_admin）驗證列表與權限。

---

## 七、安全與合規要點

### 7.1 必須落實項目

- **JWT 與 ENCRYPTION_KEY**：正式環境一律使用強隨機值，勿使用開發用字串。
- **CORS**：後端 `CORS_ORIGIN` 僅允許正式前端網址，避免任意來源請求。
- **HTTPS**：前端、後端、mediamtx 對外介面皆使用 HTTPS。
- **敏感資訊**：不在程式碼或版控中寫入密碼、金鑰；僅透過環境變數注入。
- **mediamtx API（9997）**：僅限 Backend 可達（本機或內網），不對公網開放。

### 7.2 建議項目

- 定期輪替 JWT secret 與 ENCRYPTION_KEY（需配合遷移或重登策略）。
- 資料庫連線使用 SSL（若 PostgreSQL 支援，在 `DATABASE_URL` 加上 `?sslmode=require` 等）。
- 依需求啟用 rate limiting、logging、監控告警（見下節）。

---

## 八、監控與維運

### 8.1 建議監控項目

| 項目 | 說明 |
|------|------|
| 後端可用性 | 健康檢查端點或主要 API 的 uptime |
| 資料庫連線 | 連線池或查詢失敗率 |
| 錯誤率 | 5xx 與 4xx 比例、log 集中收集 |
| 攝影機串流 | mediamtx path 狀態、推流是否正常（可選） |

### 8.2 日誌與除錯

- 正式環境勿在回應中暴露 stack 或內部錯誤訊息（專案約定已要求 500 回通用訊息）。
- 日誌可輸出至 Railway / Vercel 內建日誌，或接第三方服務（如 Logtail、Datadog）。
- 問題排查時可參考：`docs/camera-stream-verification.md`、`docs/remote-camera-system-design.md`、`docs/production-release-checklist.md`。

### 8.3 備份與還原

- PostgreSQL：依 Railway 或自備 DB 的備份機制，訂定備份頻率與保留天數。
- R2：依 Cloudflare 與公司政策決定版本與生命週期。

---

## 九、時程建議（範例）

| 階段 | 預估時間 | 產出 |
|------|----------|------|
| 網域與 URL 規劃 | 0.5 天 | 確定前端、後端、stream 網址 |
| 後端 + DB 部署 | 1～2 天 | Railway 上線、migration 完成、API 可呼叫 |
| mediamtx 部署（若需要） | 0.5～1 天 | mediamtx 可連、MEDIAMTX_PUBLIC_HOST 正確 |
| 前端部署 | 0.5 天 | Vercel 上線、可登入並呼叫正式 API |
| R2 設定與驗證 | 0.5 天 | 檔案上傳／下載正常 |
| 端到端驗收與調整 | 1～2 天 | 檢查清單全數通過、已知問題記錄 |

總計約 **4～7 個工作天**（依是否含攝影機、自訂網域、CI/CD 設定而增減）。

---

## 十、發布前檢查清單（摘要）

上線前請依 **`production-release-checklist.md`** 完整走過一輪；此處僅摘要要點：

- [ ] 後端：ENCRYPTION_KEY、JWT、CORS、DATABASE_URL、MEDIAMTX_*、R2（若用）皆已設且為正式值。
- [ ] 資料庫：已執行 `prisma migrate deploy`（及必要 seed）。
- [ ] mediamtx：已部署且與 Backend 連通，MEDIAMTX_PUBLIC_HOST 為對外 https URL。
- [ ] 前端：VITE_API_URL 指向正式後端，建置無錯誤。
- [ ] 功能驗收：登入、專案、攝影機列表與即時畫面、檔案上傳（若使用）皆在正式環境測試通過。

---

## 十一、相關文件

| 文件 | 說明 |
|------|------|
| **`deployment-setup-guide.md`** | **Railway、Vercel、Cloudflare R2 逐步架設教學（prod 分支）** |
| `production-release-checklist.md` | 發布前檢查、攝影機功能確認、部署架構細節 |
| `camera-stream-verification.md` | 攝影機串流驗證步驟 |
| `remote-camera-system-design.md` | 攝影機系統設計 |
| `camera-streaming-pipeline-summary.md` | 攝影機管線、環境變數與踩坑 |
| `multi-tenant-and-product-gap-analysis.md` | 多租戶與單租／客戶端部署考量 |
| 後端 `.env.example` | 環境變數範例與註解 |
| 前端 `.env.example` | VITE_API_URL 範例 |

---

*本規劃書可隨實際網域、託管服務與時程調整；更新時請同步檢視 production-release-checklist 與上述相關文件。*
