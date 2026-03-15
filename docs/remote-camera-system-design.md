# 遠端攝影機串接系統 — 系統設計與部署規劃

> 架構設計 · 資料模型 · 權限與播放 · 部署階段 · 待辦項目  
> 適用：Construction Dashboard（多租戶 PMIS · 專案級監測）  
> 版本 1.0　2026 年 3 月

---

## 一、目標與範圍

### 1.1 系統概述

讓工程管理人員在辦公室（外網）透過瀏覽器，即時觀看各工地現場攝影機畫面。串流經雲端中轉，由 Backend 控管權限與 Token，前端以 WebRTC 播放；未來可擴充 AI 分析（安全帽、闖入偵測等）與告警。

| 項目 | 說明 |
|------|------|
| **定位** | 專案級資源：攝影機屬於「專案」（Project），與現有監測（設備、影像、報表）同一層級。 |
| **多租戶** | 延續現有 Tenant / Project 模型，所有查詢與 API 依 `tenant_id`、`project_id` 隔離。 |
| **交付模式** | 可支援雲端 SaaS（月費／年費）與私有部署（授權 + 年維護），技術準備見 §7。 |

### 1.2 與現有產品對齊

- **前端**：專案內路徑 `/p/:projectId/monitoring/*` 已有「設備」「影像」入口（如 `MonitoringDevicesView`、`MonitoringDeviceDetailView`），CCTV 作為設備類型之一，接上真實 API 與 WebRTC 播放即可。
- **後端**：Node.js + Express + Prisma + PostgreSQL，模組化 controller → service → repository；攝影機相關 API 納入專案維度，權限與既有專案成員／租戶一致。

---

## 二、整體架構

### 2.1 各層元件

| 層級 | 元件 | 技術 | 說明 |
|------|------|------|------|
| 客戶現場 | 攝影機 | RTSP 協議 | 各品牌 IP Camera，輸出影像串流 |
| 客戶現場 | go2rtc（選用） | 開源執行檔（Go） | 內網無固定 IP 時，裝在現場電腦，主動把串流推到雲端 |
| 雲端 | mediamtx | 開源執行檔（Go） | 接收 RTSP，轉成 WebRTC 供瀏覽器播放；REST API 動態管理 path |
| 雲端 | Backend | Node.js + Express + Prisma | 業務邏輯、Token 管理、權限、播放 URL 簽發、mediamtx API 中轉 |
| 雲端 | 資料庫 | PostgreSQL | 攝影機 metadata、所屬專案、Token 等 |
| 使用者端 | Frontend | Vue 3 + WebRTC | 專案內監測 → 設備／影像，即時畫面播放 |

**你不需要寫的**：go2rtc、mediamtx（直接使用，MIT 可商業使用）。  
**你需要寫的**：攝影機 CRUD、Token 與 path 管理、權限驗證、短期播放 URL 簽發、前端播放整合；未來 Phase 4 可加 AI 分析與告警。

### 2.2 架構圖

```
客戶現場                        雲端伺服器                        使用者端
─────────────                   ─────────────────                   ──────────
攝影機（RTSP）
    │
    ├─ 固定 IP 模式：雲端 mediamtx 主動拉 RTSP
    │
    └─ 內網模式：go2rtc（現場）── 主動推流 ──→  mediamtx
                                              │
                                              ├── Backend（權限、Token、播放 URL）
                                              │         │
                                              │         └── PostgreSQL
                                              │
                                              └── 前端（Vue 3）← 短期 signed URL → WebRTC 播放
```

### 2.3 連線方向與防火牆

- **內網 + go2rtc**：現場主機「主動連出」至雲端，與一般上網行為相同，不需打洞、不需開放進站 port。
- **Token**：為「串流身分識別」，讓雲端知道此連線對應哪一台攝影機（一機一 Token），非用於 NAT 穿透。

---

## 三、資料模型與歸屬

### 3.1 攝影機所屬

- **一台攝影機屬於一個專案**（Project）。  
- 權限：能存取該專案的使用者，經 Backend 驗證後可取得該專案下攝影機列表與播放資格。  
- 未來若需「租戶層設備上限」（例如每租戶最多 N 台攝影機），見 §8 待辦。

### 3.2 Token 與攝影機對應

- **一個 Token 嚴格對應一台攝影機**（1 : 1）。  
- Token 由 Backend 產生（建議 UUID v4），寫入資料庫並同步至 mediamtx 的 path 設定；撤銷時刪除 path 或使 Token 失效，即切斷串流。

### 3.3 資料表概念（Prisma）

以下為設計用欄位說明，實際 migration 依實作時再落版。

| 概念 | 說明 |
|------|------|
| **Camera** | `id`, `projectId`, `tenantId`（冗餘，方便查詢）, `name`, `streamToken`（唯一）, `connectionMode`（fixed_ip \| go2rtc）, `sourceUrl`（固定 IP 時為 RTSP URL；go2rtc 時可為空或註記）, `status`（active \| disabled）, `createdAt`, `updatedAt` |
| **關聯** | Camera 屬於 Project（`projectId` → Project.id）；查詢時一律帶 `projectId` 並驗證使用者有權存取該專案。 |

- `streamToken`：唯一，對應 mediamtx 的 path 名稱（例如 path 為 `/live/{streamToken}`）。  
- 軟性停用：`status = disabled` 或自 mediamtx 移除 path，畫面消失但可再啟用。  
- 硬性撤銷：Token 失效或刪除 path，代理連回也被拒絕。

---

## 四、連線模式

| 模式 | 需要固定 IP | 需要現場代理 | 適用情境 |
|------|-------------|--------------|----------|
| **固定 IP** | ✅ 需要 | ❌ 不需要 | 攝影機或現場網路有對外固定 IP，雲端 mediamtx 主動拉 RTSP |
| **內網 + go2rtc** | ❌ 不需要 | ✅ 需要 | 現場僅內網，由 go2rtc 主動推流至雲端（Phase 3） |

兩種模式可並存；同一專案下可部分攝影機固定 IP、部分 go2rtc。

---

## 五、安全與播放權限

### 5.1 原則

- **mediamtx 不直接對外暴露管理 API**：9997 僅 listen localhost，所有 path 新增／刪除／查詢經由 Backend 在伺服器本機呼叫 mediamtx API。
- **對外只暴露「播放用」端點**：例如 Nginx 只開放 WebRTC/HTTPS 的播放路徑，且播放 URL 須經 Backend 簽發，帶短期有效簽章。

### 5.2 前端播放與權限（採用方案）

採用 **Backend 簽發短期播放 URL，前端直連 mediamtx（或 Nginx）播 WebRTC**：

1. 前端要播某台攝影機時，呼叫 Backend API（例如 `GET /api/v1/projects/:projectId/cameras/:cameraId/play-url`）。
2. Backend 檢查：當前使用者是否具該專案存取權、攝影機是否存在且屬於該專案、攝影機是否啟用。
3. 通過後 Backend 產生**短期有效**的播放 URL（例如 5～15 分鐘），內含簽章或一次性參數，回傳給前端。
4. 前端使用該 URL 直連 mediamtx（或 Nginx 轉發）播放 WebRTC；**不將長期 Token（path 用）直接交給前端**。
5. 影音流量不經 Backend，延遲與負載較小；實作上僅需簽章與過期時間邏輯。

可選強化：IP 綁定、同一使用者並發串流數上限等，依需求後續加入。

### 5.3 資安對照

| 風險 | 處理方式 |
|------|----------|
| mediamtx API 無驗證 | 9997 只對 localhost，由 Backend 中轉 |
| Token 外洩 | UUID v4、可隨時撤銷；播放用短期 URL 不暴露長期 Token |
| 多租戶隔離 | 所有 API 強制帶 `projectId`／`tenantId`，查詢過濾 |
| 影像留存疑慮 | 預設不儲存影像，只即時轉發；合約可載明 |

---

## 六、API 設計（高層）

以下為與攝影機相關的 API 概念，實作時依 REST 慣例與現有 API 風格為準。

| 用途 | 方法與路徑 | 說明 |
|------|------------|------|
| 列表 | `GET /api/v1/projects/:projectId/cameras` | 回傳該專案下攝影機清單（含名稱、狀態、連線模式等），需專案權限 |
| 新增 | `POST /api/v1/projects/:projectId/cameras` | 新增攝影機（含連線模式、sourceUrl 等），Backend 產生 Token 並向 mediamtx 新增 path |
| 詳情 | `GET /api/v1/projects/:projectId/cameras/:cameraId` | 單一攝影機詳情 |
| 更新 | `PATCH /api/v1/projects/:projectId/cameras/:cameraId` | 更新名稱、sourceUrl、status 等 |
| 停用／刪除 | `DELETE` 或 `PATCH .../disable` | 軟停用或刪除 path／撤銷 Token |
| **播放** | `GET /api/v1/projects/:projectId/cameras/:cameraId/play-url` | 取得短期播放 URL（含簽章），供前端 WebRTC 播放 |

所有端點需驗證使用者對 `projectId` 具存取權，並強制過濾 `tenant_id`／`project_id`。

---

## 七、部署規劃

### 7.1 開發階段（Phase）

| 階段 | 內容 |
|------|------|
| **Phase 1 — 本機驗證** | 本機跑通 mediamtx、go2rtc（可選），用 VLC 確認 RTSP；mediamtx REST API 動態新增 path；Vue 3 以 WebRTC 播出畫面。 |
| **Phase 2 — 固定 IP MVP** | 攝影機資料表與 CRUD、Token 與 mediamtx path 管理、專案維度權限、播放 URL 簽發 API、前端設備列表與播放整合。 |
| **Phase 3 — 內網代理** | 整合 go2rtc：Token 配對、現場安裝精靈 UI、客製化下載包（含 Token 的 go2rtc 設定）。 |
| **Phase 4 — 進階** | AI 分析（若要做）、Docker 容器化、私有部署支援、告警通知（見 §8）。 |

### 7.2 部署模式

| 模式 | 收費概念 | 適用 |
|------|----------|------|
| **雲端 SaaS** | 月費／年費 | 中小型營造廠，維護集中 |
| **私有部署** | 一次授權 + 年維護 | 大型集團、政府、資料不出客戶機房 |

私有部署要點：設定透過環境變數（`.env`）、Docker Compose 打包 Backend / Frontend / mediamtx / PostgreSQL，不綁定特定雲端；go2rtc 取得方式依原設計文件（安裝精靈、客製化下載包）。

### 7.3 規模擴展（參考）

| 階段 | 工地／串流規模 | 建議 |
|------|----------------|------|
| MVP | 1～10 | 單機 mediamtx + Backend |
| 成長 | 10～50 | 多台 mediamtx + Nginx 負載平衡 |
| 更大 | 50+ | 依流量評估水平擴展或 P2P 等方案 |

---

## 八、待辦與未來項目（記錄）

以下項目已共識**暫不實作**或**延後討論**，僅記錄於此供後續規劃。

| 項目 | 狀態 | 說明 |
|------|------|------|
| **租戶層設備／連線限制** | 待討論 | 是否對「同一租戶下所有專案」設定攝影機或串流數上限（例如每租戶 N 台）。目前先不做，之後再議。 |
| **AI 分析服務** | 未來再做 | 觸發方式（即時拉流 vs 定時抽幀）、分析結果是否寫入 DB、事件表（如 CameraEvent）與告警通知，目前不納入；Phase 4 或之後再設計。 |
| **go2rtc 取得方式** | Phase 3 實作 | 依原設計：安裝精靈、客製化下載包（含 Token 的設定），在 Phase 3 一併完成。 |

---

## 九、文件與參考

- 原始需求與架構說明：遠端攝影機串接系統（架構設計 · 資安 · 說服策略 · 部署模式）v1.0。
- 本專案後端：`docs/backend-prisma-api.md`、`prisma/schema.prisma`；前端：`/p/:projectId/monitoring/*`、設備／影像相關 View。

---

*版本 1.0　2026 年 3 月　Construction Dashboard 後端 docs*
