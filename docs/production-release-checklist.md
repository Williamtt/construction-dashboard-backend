# 正式環境發布檢查與部署評估

本文件涵蓋：**攝影機（CCTV）功能完整性確認**、**發布前檢查清單**、**正式環境部署方式**（Backend / Frontend / mediamtx）與**注意事項**。

---

## 一、攝影機功能完整性確認

### 1.1 已實作項目

| 項目 | 狀態 | 說明 |
|------|------|------|
| 後端 Camera 模型與 migration | ✅ | `cameras` 表含 streamToken、lastStreamAt、sourceUrlEnc 等 |
| 後端 Camera CRUD API | ✅ | 列表、新增、取得、更新、刪除（含專案權限） |
| 後端 mediamtx 整合 | ✅ | addPublisherPath、removePath、getRuntimePathsList（path ready 狀態） |
| 後端連線狀態（connectionStatus） | ✅ | online / offline / not_configured，依 mediamtx 即時狀態與 lastStreamAt 計算 |
| 後端 play-url、install-config、安裝包下載 | ✅ | 含簽發播放網址、YAML 片段、一鍵安裝 zip（Windows / Mac） |
| 設備 RTSP 加密儲存 | ✅ | sourceUrlEnc + ENCRYPTION_KEY，解密僅用於產出下載設定 |
| 前端攝影機列表、新增、安裝精靈 | ✅ | 專案內設備管理、三步驟精靈、下載包依 OS 區分 |
| 前端即時畫面播放 | ✅ | 使用 mediamtx reader.js（MediaMTXWebRTCReader）避免 SDP ice-ufrag 問題 |
| 前端連線狀態顯示 | ✅ | 線上／離線／尚未設定，hasStream 驅動「即時畫面連線中」文案 |
| go2rtc 一鍵安裝包 | ✅ | 正確 publish key = stream 名稱、ffmpeg H264+AAC、rtsp listen 8556 避免與 mediamtx 衝突 |

### 1.2 可選後續優化（非擋正式版）

| 項目 | 說明 |
|------|------|
| 傳輸速度／位元率顯示 | 可從 WebRTC getStats() 取得後顯示在即時畫面區 |
| mediamtx 重啟後 path 自動補登 | 目前 path 為 mediamtx 記憶體狀態，重啟後需重新 add；可做 Backend 啟動時依 DB 的 cameras 對 mediamtx 重新註冊 path |
| Windows 一鍵安裝包 | 目前 go2rtc 官方 release 未提供 Windows zip，run.bat 的下載 URL 可能 404，正式環境若需支援 Windows 可改為文件說明或提供 Linux 版 |

### 1.3 結論

攝影機串流與儀表板播放流程**已可支援正式環境使用**，上述可選項目可依需求排入後續迭代。

---

## 二、發布前檢查清單

### 2.1 環境變數與安全

- [ ] **ENCRYPTION_KEY**（後端）：正式環境必設，用於加密設備 RTSP 網址；建議 `openssl rand -hex 16` 或 `openssl rand -base64 32`
- [ ] **JWT_SECRET / JWT_REFRESH_SECRET**：改為強隨機值，勿使用開發用字串
- [ ] **CORS_ORIGIN**（後端）：設為正式前端網址（例如 `https://your-app.vercel.app`），多個用逗號分隔
- [ ] **DATABASE_URL**：指向正式 PostgreSQL（如 Railway 提供的連線字串）
- [ ] **MEDIAMTX_PUBLIC_HOST**：正式環境改為 **https** 且為對外可連的 mediamtx 網址（見下節）
- [ ] **MEDIAMTX_API_URL**：僅 Backend 本機呼叫，維持 `http://127.0.0.1:9997`（若 mediamtx 與 Backend 同機）
- [ ] **VITE_API_URL**（前端）：建置時注入正式後端 API 網址（例如 `https://your-api.railway.app`）

### 2.2 資料庫

- [ ] 正式 DB 已建立，並執行過 **Prisma migrations**（`npm run db:migrate` 或 `prisma migrate deploy`）
- [ ] 必要時執行 seed（若專案有定義）

### 2.3 攝影機與串流

- [ ] 正式環境有部署 **mediamtx**，且 Backend 能透過 MEDIAMTX_API_URL 呼叫（同機或內網）
- [ ] 對外播放與 go2rtc 推流使用 **MEDIAMTX_PUBLIC_HOST**（需為現場與瀏覽器可連之 host，且正式環境建議 https）
- [ ] 現場下載的安裝包內 go2rtc.yaml 的 `rtmp://...` 會使用上述 host，確認與實際 mediamtx 所在一致

### 2.4 前端

- [ ] 正式建置無錯誤（`npm run build`）
- [ ] 登入、專案列表、攝影機列表與即時畫面在正式 API 下測試過一輪

---

## 三、正式環境部署架構建議

依專案約定：**Backend 部署於 Railway、Frontend 部署於 Vercel**。攝影機串流需 **mediamtx** 與 Backend 協同，以下為建議架構與步驟。

### 3.1 架構概觀

```
[ 現場 go2rtc ]  --RTMP 推流-->  [ mediamtx ]  <--WebRTC 播放--  [ 瀏覽器 ]
                                       ^
                                       | API (localhost)
                                       |
[ 瀏覽器 ]  --HTTPS API-->  [ Backend (Railway) ]  --DB-->  [ PostgreSQL ]
[ 前端 (Vercel) ]
```

- **Backend**：提供 REST API、登入、Camera CRUD、play-url、安裝包下載；呼叫 mediamtx API（僅限本機或內網）。
- **mediamtx**：接收 go2rtc 的 RTMP 推流（port 1935）、提供 WebRTC 播放（port 8889）；**必須**與 Backend 能互通（API 9997），且對外提供 8889（或經反向代理）供瀏覽器與 go2rtc 使用。
- **Frontend**：靜態站，建置時帶入 VITE_API_URL，播放時使用 play-url（mediamtx 的 WHEP 端點）。

### 3.2 Backend（Railway）

1. **專案與部署**
   - 使用現有 Node 專案，Build 指令：`npm run build`（或 `npm install && npx prisma generate && npm run build`）。
   - Start 指令：`npm run start`（即 `node dist/index.js`）。
   - Root 目錄指向 backend 專案。

2. **環境變數（必設）**
   - `PORT`：Railway 會注入，無須自設。
   - `NODE_ENV=production`
   - `DATABASE_URL`：Railway PostgreSQL 或自備 Postgres 連線字串。
   - `JWT_SECRET`、`JWT_REFRESH_SECRET`：強隨機。
   - `CORS_ORIGIN`：正式前端網址，例如 `https://your-dashboard.vercel.app`。
   - `ENCRYPTION_KEY`：設備 RTSP 加密用，必設。
   - `MEDIAMTX_API_URL`：若 mediamtx 與 Backend **同機** 則 `http://127.0.0.1:9997`；若 **不同機** 則為 mediamtx 主機的 `http://MEDIAMTX_HOST:9997`（需內網或 VPN 可達）。
   - `MEDIAMTX_PUBLIC_HOST`：**對外** WebRTC 播放 base URL，須與前端／現場 go2rtc 實際連線一致；正式環境建議 **https**，例如 `https://stream.your-domain.com`（由 Nginx 等反代 mediamtx 8889）。
   - `MEDIAMTX_RTMP_PORT`：預設 1935，若 mediamtx 改用其他 port 再設。

3. **mediamtx 與 Backend 同機時（Railway 單服務）**
   - 在 Railway 同一服務中，Build 時一併取得 mediamtx 執行檔，Start 時先啟動 mediamtx 再啟動 Node（或用 process manager 同時跑兩者）。
   - 注意：Railway 單一服務通常只暴露一個對外 port，需以 **一個對外 port 反代 Backend + mediamtx**（例如 Nginx 依 path 轉發 API 與 WebRTC），或將 mediamtx 拆成另一服務並暴露 1935／8889。

4. **mediamtx 與 Backend 不同機時（建議）**
   - 將 **mediamtx** 部署在另一台主機或容器（VPS / 另一 Railway 服務），對外開放 1935（RTMP）、8889（WebRTC），或經 Nginx 反代 8889 並提供 https。
   - Backend 的 `MEDIAMTX_API_URL` 指向該主機的 9997（僅內網或 VPN，勿對公網開放 9997）。
   - `MEDIAMTX_PUBLIC_HOST` 設為該 mediamtx 的**對外** base URL（https 為佳），例如 `https://stream.your-domain.com`。

5. **DB migrations**
   - 部署後首次或每次含 migration 的部署：在 Railway 執行 `npx prisma migrate deploy`（可加在 Build 或單次 job）。

### 3.3 mediamtx 伺服器

- **Port**：1935（RTMP）、8889（WebRTC）；9997（API）僅供 Backend 呼叫，不對外。
- **設定**：啟用 `api: true`、`rtmp: true`、`webrtc: true`；path 由 Backend 動態新增，勿在設定檔寫死攝影機 path。
- **CORS**：若前端與 mediamtx 不同 domain，確認 `webrtcAllowOrigins` / `playbackAllowOrigins` 含前端 origin。
- **正式環境**：對外建議經 Nginx（或同類）反代 8889，提供 **https**，並將該 https base URL 設為 Backend 的 **MEDIAMTX_PUBLIC_HOST**。

### 3.4 Frontend（Vercel）

1. **建置**
   - Build：`npm run build`。
   - 環境變數：**VITE_API_URL** = 正式 Backend API 根網址（例如 `https://your-api.railway.app`），建置時會寫入前端。

2. **無額外攝影機專用設定**
   - 播放網址由 Backend play-url API 回傳，前端僅需能連線至該 URL（mediamtx 的 WHEP）；若 mediamtx 為 https 且 CORS 正確，即可播放。

### 3.5 現場 go2rtc 與下載包

- 使用者從**正式環境**儀表板下載的安裝包，內含的 `go2rtc.yaml` 會使用 Backend 當時的 **MEDIAMTX_PUBLIC_HOST** 與 **MEDIAMTX_RTMP_PORT** 組出 `rtmp://...`。
- 因此正式環境務必正確設定 **MEDIAMTX_PUBLIC_HOST**（與實際 mediamtx 對外 host/port 一致），現場執行 go2rtc 才能推流成功。

---

## 四、mediamtx 重啟後 path 註冊

目前 mediamtx 的 path 為**記憶體狀態**，重啟後會清空，Backend 不會自動補登。

- **短期**：重啟 mediamtx 後，若有新攝影機或需恢復推流，可透過「新增攝影機」或未來實作的「同步 path」流程再次註冊。
- **建議**：在 Backend 啟動時（或定時）依 DB 中所有 Camera 的 `streamToken` 呼叫 `addPublisherPath(streamToken)`，確保 mediamtx 重啟後 path 仍存在。此為可選實作，不影響目前正式版發布。

---

## 五、文件與維運參考

- 攝影機串流驗證步驟：`docs/camera-stream-verification.md`
- 系統設計與 Phase 3 規劃：`docs/remote-camera-system-design.md`、`docs/remote-camera-phase3-plan.md`
- 環境變數範例：後端 `.env.example`、前端 `.env.example`

---

## 六、發布步驟摘要

1. **後端**：在 Railway 設定正式 env（含 ENCRYPTION_KEY、JWT、CORS、DATABASE_URL、MEDIAMTX_*），部署並執行 `prisma migrate deploy`。
2. **mediamtx**：在可與 Backend 連線的機器上部署，對外提供 1935／8889（或 https 反代），9997 僅供 Backend；設定 MEDIAMTX_PUBLIC_HOST 與實際對外 URL 一致。
3. **前端**：在 Vercel 設定 VITE_API_URL 為正式 Backend URL，建置並部署。
4. **驗收**：登入、建立專案、新增攝影機、下載安裝包、現場執行 go2rtc、儀表板即時畫面可播放且狀態為「線上」。

完成以上即具備正式環境發布條件；可選項目（path 自動註冊、傳輸速度顯示、Windows 安裝包等）可列為後續迭代。
