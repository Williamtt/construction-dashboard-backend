# 遠端攝影機串接 — Phase 3 內網 + go2rtc 完整規劃

> 目標：跳過固定 IP（Phase 2），直接實作「內網現場 + go2rtc 推流」情境，含後端、前端、伺服器與現場安裝流程。  
> 前置：`docs/remote-camera-system-design.md`、Phase 1 已完成（mediamtx + WebRTC 本機驗證）

---

## 一、Phase 3 目標與範圍

### 1.1 業務目標

- 工地現場在**內網**、無固定 IP，在現場電腦安裝 **go2rtc**，將內網攝影機的 RTSP 串流**主動推**到雲端 mediamtx。
- 辦公室人員透過 Construction Dashboard 專案內「監測 → 設備／影像」**即時收看**，權限依專案成員控管。
- 攝影機以**專案**為單位管理，一機一 **Token**；Token 用於識別推流身分，並寫入 go2rtc 設定，現場安裝後即可連線。

### 1.2 不納入本階段

- 固定 IP 模式（Phase 2）：雲端 mediamtx 主動拉 RTSP，延後實作。
- AI 分析、錄影儲存、告警通知：見設計文件 §8，未來再做。
- 租戶層設備數量上限：待討論，僅記錄。

### 1.3 完成標準（Phase 3 Done）

- [ ] 後端：Camera 表、專案維度 CRUD、Token 產生與 mediamtx path 同步、播放 URL 簽發 API。
- [ ] 伺服器：mediamtx 接受 go2rtc 的 RTMP 推流，path 名 = Token；Backend 僅透過 localhost 呼叫 mediamtx API。
- [ ] 前端：專案內攝影機列表、新增攝影機（取得 Token）、**安裝精靈**（步驟引導）、**客製化下載包**（含 Token 與雲端位址的 go2rtc 設定）、WebRTC 播放整合。
- [ ] 現場：依精靈下載並執行 go2rtc，設定檔內含 Token 與 mediamtx 位址，推流成功後儀表板可收看。

---

## 二、整體流程與架構

### 2.1 連線流程（內網 + go2rtc）

```
現場（內網）                                    雲端
─────────────                                   ─────────────────
攝影機 (RTSP)
    │
    ▼
go2rtc（現場電腦）
  - 從 YAML 讀取：streams（攝影機 RTSP）+ publish（推流目標）
  - publish 目標：rtmp://MEDIAMTX_HOST:1935/{streamToken}
    │
    └────────── 主動推流（RTMP）────────────────→  mediamtx :1935
                                                       │ path 名 = streamToken
                                                       │ source = publisher
                                                       ▼
                                                WebRTC :8889 / {streamToken}
                                                       │
Backend（權限、play-url）◄─────────────────────────────┘
    │
    └── 前端（Vue）取得 play-url → 播放 WebRTC
```

- **Token**：Backend 建立 Camera 時產生（UUID v4），寫入 DB 並在 mediamtx 新增同名 path（`source: publisher`），供 go2rtc 推流。
- **go2rtc 設定**：由 Backend 或前端提供「含 Token 與 mediamtx 主機的 publish URL」，打包進下載檔或精靈產生的設定。

### 2.2 技術分工

| 元件 | 職責 |
|------|------|
| **Backend** | Camera CRUD、Token 產生、mediamtx API（add/patch/remove path）、play-url 簽發、下載包或設定檔產出（含 Token 的 go2rtc.yaml 片段或完整檔）。 |
| **mediamtx** | 聆聽 RTMP 1935、WebRTC 8889；path 由 Backend 動態新增（name = streamToken, source = publisher）。 |
| **Frontend** | 攝影機列表、新增／編輯／停用、安裝精靈 UI、觸發下載（含 Token 的設定）、播放頁（呼叫 play-url 後用 WebRTC 播）。 |
| **go2rtc（現場）** | 使用者在現場安裝，設定由我們提供（streams + publish），無需自寫程式。 |

---

## 三、後端設計

### 3.1 資料庫：Camera 表

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | String (cuid) | 主鍵 |
| projectId | String (FK → Project) | 所屬專案 |
| tenantId | String? (冗餘) | 方便查詢與隔離 |
| name | String | 顯示名稱（如「大門入口」） |
| streamToken | String @unique | 唯一 Token（UUID v4），= mediamtx path 名 |
| connectionMode | String | 固定為 `go2rtc`（本階段） |
| sourceUrl | String? | go2rtc 情境可填現場攝影機 RTSP（供說明或未來用），非必填 |
| status | String | `active` \| `disabled` |
| createdAt | DateTime | |
| updatedAt | DateTime | |

- **關聯**：Camera 屬於 Project；查詢時一律帶 `projectId` 且過濾 `tenantId`。
- **索引**：`projectId`、`streamToken`、`tenantId`。

### 3.2 mediamtx 整合（go2rtc 推流）

- go2rtc 以 **RTMP** 推流至 mediamtx（非 RTSP push）；mediamtx 聆聽 `:1935`，path 名 = stream key。
- **新增 Camera 時**：Backend 呼叫 mediamtx API  
  `POST /v3/config/paths/add/{streamToken}`  
  body: `{ "source": "publisher" }`  
  表示該 path 接受 RTMP/RTSP 等 publish。
- **刪除／停用 Camera 時**：  
  `DELETE /v3/config/paths/remove/{streamToken}`（若 API 支援）或 PATCH 停用，或於 mediamtx 側實作「拒絕該 path 的 publish」。
- mediamtx 的 9997 API 僅對 localhost 開放，Backend 在伺服器本機呼叫；環境變數如 `MEDIAMTX_API_URL=http://127.0.0.1:9997`。

### 3.3 go2rtc 設定產出

- 現場 go2rtc 需兩類資訊：  
  (1) **streams**：現場攝影機 RTSP（使用者在精靈或設定中填寫，或之後在 app 填）。  
  (2) **publish**：推流目標，格式為 `rtmp://MEDIAMTX_HOST:1935/STREAM_TOKEN`（path 名 = streamToken）。
- Backend 提供：  
  - **取得安裝參數 API**：`GET /api/v1/projects/:projectId/cameras/:cameraId/install-config`  
    回傳 `{ streamToken, mediamtxHost, rtmpPublishUrl, go2rtcYamlSnippet }` 等（mediamtxHost 來自環境變數或設定）。  
  - 或 **下載包**：產生一個內含預填 `go2rtc.yaml` 的 zip（含 Token、mediamtx 主機、可選的 streams 範例），供精靈「下載安裝包」使用。

### 3.4 API 清單（REST）

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | /api/v1/projects/:projectId/cameras | 列表（需專案權限） |
| POST | /api/v1/projects/:projectId/cameras | 新增攝影機（name 必填；產生 streamToken；呼叫 mediamtx add path） |
| GET | /api/v1/projects/:projectId/cameras/:cameraId | 詳情 |
| PATCH | /api/v1/projects/:projectId/cameras/:cameraId | 更新（name、status 等） |
| DELETE | /api/v1/projects/:projectId/cameras/:cameraId | 刪除（同步移除 mediamtx path） |
| GET | /api/v1/projects/:projectId/cameras/:cameraId/play-url | 簽發短期播放 URL（WebRTC），需專案權限 |
| GET | /api/v1/projects/:projectId/cameras/:cameraId/install-config | 取得安裝用 Token、mediamtx 主機、publish URL、YAML 片段或下載連結 |

- 所有 API 需驗證「當前使用者具該專案存取權」（與既有專案成員／權限一致）。
- play-url 回傳格式可為：`{ "url": "https://MEDIAMTX_PUBLIC_HOST/STREAM_TOKEN/whep", "expiresIn": 900 }`（例：15 分鐘有效），前端用此 URL 接 WebRTC。

### 3.5 目錄與模組建議

- `src/modules/camera/`：camera.controller.ts、camera.service.ts、camera.repository.ts  
- `src/modules/camera/mediamtx.client.ts`：封裝對 mediamtx API 的呼叫（add/patch/remove path）。  
- `src/routes/cameras.ts` 或掛在 `projects.ts` 下：`/projects/:projectId/cameras`。  
- Schema：`src/schemas/camera.ts`（Zod：create、update、install-config 回應）。

---

## 四、伺服器與 mediamtx

### 4.1 mediamtx 設定要點

- **RTMP**：啟用並聆聽 `:1935`，接受 publish。  
- **WebRTC**：啟用 `:8889`，對外提供播放（或經 Nginx 反向代理）。  
- **API**：`:9997` 僅 localhost，由 Backend 呼叫。  
- **path**：不預先寫死；由 Backend 在「新增 Camera」時動態 add path（name = streamToken, source = publisher）。

### 4.2 環境變數（Backend）

- `MEDIAMTX_API_URL`：預設 `http://127.0.0.1:9997`。  
- `MEDIAMTX_PUBLIC_HOST` 或 `MEDIAMTX_WEBRTC_URL`：對外 WebRTC 的 base URL（供 play-url 與 go2rtc 說明使用），例如 `https://stream.example.com`。

### 4.3 部署時注意

- 若 mediamtx 與 Backend 同機：Backend 直接連 `http://127.0.0.1:9997`。  
- 若分機：mediamtx API 需在內網可達，且 9997 僅限內網或 localhost，不對公網開放。

---

## 五、前端設計

### 5.1 頁面與路由

- **攝影機列表**：`/p/:projectId/monitoring/devices`（既有）改為可區分「CCTV」設備，並從 API 取得專案攝影機列表；或獨立路由 `/p/:projectId/monitoring/cameras`。  
- **攝影機詳情／播放**：`/p/:projectId/monitoring/devices/:deviceId` 或 `/p/:projectId/monitoring/cameras/:cameraId`，內含 WebRTC 播放區塊與「安裝設定」入口。  
- **新增攝影機**：列表頁按鈕「新增攝影機」→ 表單（名稱等）→ 送出後取得 Token，進入安裝精靈。  
- **安裝精靈**：獨立頁或 Dialog，步驟見下節。

### 5.2 安裝精靈流程（五步驟）

| 步驟 | 標題 | 內容 |
|------|------|------|
| 1 | 新增攝影機 | 輸入名稱 → 呼叫 POST cameras → 取得 streamToken。 |
| 2 | 下載 go2rtc | 說明「請在現場電腦下載 go2rtc」，按鈕「下載安裝包」或「下載設定檔」→ 取得含 Token 與 mediamtx 位址的 zip/yaml。 |
| 3 | 設定攝影機來源 | 說明在 go2rtc 的 YAML 中設定 `streams`（現場 RTSP），可提供範例或預填一組範例 stream 名稱。 |
| 4 | 執行 go2rtc | 說明在現場執行 go2rtc、確認防火牆允許連出。 |
| 5 | 完成 | 提示「連線成功後，回到此頁即可收看」、連結至該攝影機播放頁。 |

- 精靈可設計為 Stepper（步驟條）＋ 每步一區塊說明與操作（表單、下載按鈕、說明文字）。  
- 「下載安裝包」可呼叫 Backend 的 install-config 或專用「下載包」API，回傳 zip 或直接回傳 YAML 內容由前端組檔下載。

### 5.3 攝影機列表與播放

- **列表**：呼叫 `GET .../cameras`，顯示 name、status（可依 mediamtx path 是否 ready 顯示在線／離線）、connectionMode。  
- **播放**：進入詳情頁後呼叫 `GET .../cameras/:cameraId/play-url`，取得 WebRTC URL 後用現有或新加 WebRTC 播放元件（如 WHEP client）綁到 `<video>`。  
- 需支援主題（深色／淺色），依既有 theme 規範。

### 5.4 共用與型別

- API  client：`src/api/cameras.ts` 或納入 `src/api/monitoring.ts`（getCameras、createCamera、getPlayUrl、getInstallConfig 等）。  
- 型別：`Camera`、`PlayUrlResponse`、`InstallConfigResponse` 等，與後端契約一致。

---

## 六、go2rtc 設定與下載包

### 6.1 go2rtc 設定格式（參考）

- **publish**：推流到 mediamtx，path 名 = Token。  
  ```yaml
  publish:
    video_audio_transcode:   # 或依需要選轉碼 profile
      - rtmp://MEDIAMTX_HOST:1935/STREAM_TOKEN
  streams:
    camera1:   # 現場攝影機的 stream 名稱，可與 Token 不同
      - rtsp://user:pass@192.168.1.100:554/stream1
  ```
- 上述 `MEDIAMTX_HOST`、`STREAM_TOKEN` 由 Backend 或前端依 install-config 替換後寫入下載的 YAML。

### 6.2 下載包內容建議

- **選項 A**：zip 內含 `go2rtc.yaml`（已填好 publish + 一組 streams 範例）、README.txt（執行方式、現場攝影機 RTSP 填寫說明）。  
- **選項 B**：僅提供「下載 go2rtc 執行檔」連結（官方 release）+ 頁面顯示或下載「設定檔片段」，讓使用者自行合併到自己的 go2rtc.yaml。  
- 本階段建議至少實作**選項 A**，精靈內「下載安裝包」即下載此 zip。

### 6.3 安全

- Token 僅在「新增攝影機」與「安裝設定／下載包」時暴露，播放端只拿短期 play-url。  
- 下載包可加「有效期限」或「單次下載連結」（可選），避免 Token 長期散播。

---

## 七、實作順序建議

| 階段 | 內容 | 產出 |
|------|------|------|
| 1 | 後端：Camera 表（Prisma + migration）、repository、mediamtx client（add path, source=publisher） | DB、可手動測 mediamtx path |
| 2 | 後端：camera service + controller、routes、權限（專案成員）、POST/GET/PATCH/DELETE、play-url、install-config（或下載包 API） | 完整 Camera API |
| 3 | 前端：API client、型別、攝影機列表頁（接 API）、新增表單 → 取得 Token | 列表與新增流程 |
| 4 | 前端：安裝精靈（五步驟）、下載包（zip 含 yaml + 說明） | 精靈與下載 |
| 5 | 前端：播放頁（play-url + WebRTC）、詳情頁整合 | 可從儀表板收看 |
| 6 | 整合測試：建立 Camera → 下載設定 → 本機或測試環境跑 go2rtc 推流 → 儀表板播放 | Phase 3 驗收 |

---

## 八、驗收檢查表（Phase 3）

- [ ] 後端：可新增／列表／更新／刪除 Camera，Token 唯一且同步至 mediamtx path（source=publisher）。  
- [ ] 後端：play-url 需登入且具專案權限才回傳，過期時間合理。  
- [ ] 後端：install-config 或下載包提供正確的 mediamtx 主機與 Token、publish URL。  
- [ ] 前端：專案內可看到攝影機列表、新增後進入精靈、可下載含 Token 的設定或安裝包。  
- [ ] 前端：播放頁呼叫 play-url 後以 WebRTC 正常播出。  
- [ ] 現場：使用下載的 go2rtc 設定在測試環境推流，mediamtx 收到後，儀表板可收看。  
- [ ] 多租戶：僅能看見與操作自己租戶／專案下的攝影機。

---

## 九、與既有設計的對齊

- **攝影機所屬**：Camera 屬於 Project，與 `remote-camera-system-design.md` §3 一致。  
- **一機一 Token**：streamToken 唯一，對應 mediamtx 單一 path。  
- **播放權限**：Backend 簽發短期 play-url，前端不持有長期 Token，與設計文件 §5.2 一致。  
- **固定 IP**：本階段不實作；若日後要支援，可擴充 connectionMode 與 sourceUrl 邏輯，並在 mediamtx  add path 時改為拉 RTSP。

---

## 十、參考

- [go2rtc Configuration](https://github.com/AlexxIT/go2rtc/wiki/Configuration)、[Publish](https://go2rtc.org/)  
- [mediamtx Publish](https://mediamtx.org/docs/usage/publish)、[REST API](https://mediamtx.org/docs/)  
- 本專案：`docs/remote-camera-system-design.md`、`docs/remote-camera-phase1-plan.md`

---

---

## 十一、實作備註（已落版）

- **後端**：`Camera` 表、`src/modules/camera/`、`src/lib/encryption.ts`、`src/lib/mediamtx.ts`；路由掛在 `GET/POST /api/v1/projects/:projectId/cameras` 等。設備 RTSP 網址以 `ENCRYPTION_KEY` 加密儲存於 `sourceUrlEnc`。
- **前端**：`src/api/cameras.ts`、`MonitoringDevicesView.vue`（列表、新增、安裝精靈）、`MonitoringDeviceDetailView.vue`（即時畫面、設定、下載 YAML）、`useWhepPlayer.ts`（WHEP 播放）。
- **環境變數**：見後端 `.env.example`（ENCRYPTION_KEY、MEDIAMTX_API_URL、MEDIAMTX_PUBLIC_HOST）。
- **mediamtx**：已自 `mediamtx.yml` 移除含帳密之靜態 path，改由 Backend 動態新增 path（source=publisher）供 go2rtc 推流。

*Phase 3 完整規劃 v1.0　2026 年 3 月*
