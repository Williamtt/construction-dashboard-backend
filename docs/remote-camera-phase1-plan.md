# 遠端攝影機串接 — Phase 1 本機驗證 詳細規劃

> 目標：在本機跑通「RTSP 來源 → mediamtx → WebRTC 瀏覽器播放」整條鏈路，並驗證 mediamtx REST API 可動態管理串流路徑。  
> 前置文件：`docs/remote-camera-system-design.md`

---

## 一、Phase 1 目標與完成標準

### 1.1 目標

| 項目 | 說明 |
|------|------|
| **串流鏈路** | 本機有一路 RTSP 來源，經 mediamtx 轉成 WebRTC，在瀏覽器中即時播放。 |
| **動態 path** | 透過 mediamtx REST API 動態新增／刪除串流路徑，不需改設定檔重啟。 |
| **前端驗證** | Vue 3 專案內有一個最小可用的播放頁（或元件），能指定 mediamtx 的 path 並播出畫面。 |
| **可選** | 本機跑 go2rtc，模擬「現場推流到 mediamtx」情境，確認連線方向與格式無誤。 |

### 1.2 完成標準（Checklist）

- [ ] mediamtx 在本機可執行，預設 port（RTSP 8554、API 9997、WebRTC 8889）可連。
- [ ] 至少一路 RTSP 來源可被 mediamtx 讀取（ffmpeg 產生或公開測試串流）。
- [ ] 使用 REST API 成功新增一個 path，並能透過該 path 在 VLC 或瀏覽器播放。
- [ ] 使用 REST API 成功刪除該 path，播放中斷。
- [ ] Vue 3 前端能透過 WebRTC（如 mediamtx 的 WHEP 或內建 player）播出該 path 的即時畫面。
- [ ] （可選）go2rtc 在本機將一路 RTSP 推到 mediamtx，瀏覽器可收看。

---

## 二、環境與前置需求

### 2.1 必要軟體

| 軟體 | 用途 | 建議版本／取得方式 |
|------|------|---------------------|
| **mediamtx** | RTSP 接收、轉 WebRTC、REST API | 最新 release，[GitHub Releases](https://github.com/bluenviron/mediamtx/releases) 下載對應 OS 執行檔 |
| **ffmpeg** | 產生本機測試用 RTSP 或影像 | 系統套件或 [ffmpeg.org](https://ffmpeg.org/) |
| **VLC**（可選） | 驗證 RTSP 來源與 mediamtx 輸出 | 任意版本 |
| **Node.js** | 跑 Vue 3 前端 | 與現有專案一致（v18+） |
| **Vue 3 專案** | construction-dashboard-frontend | 已有，用於接 WebRTC 播放 |

### 2.2 本機 Port 預設（mediamtx）

| Port | 用途 |
|------|------|
| 8554 | RTSP（TCP）— 拉流來源或 go2rtc 推流目標 |
| 8889 | WebRTC（HTTP）— 瀏覽器播放用 |
| 9997 | REST API — 動態管理 path（**僅限 localhost**） |

確認上述 port 未被其他程式佔用。

---

## 三、步驟一：安裝與啟動 mediamtx

### 3.1 下載

- 至 [mediamtx Releases](https://github.com/bluenviron/mediamtx/releases) 下載對應作業系統的執行檔（如 `mediamtx_xxx_linux_amd64.tar.gz` 或 Windows zip）。
- 解壓後得到 `mediamtx`（或 `mediamtx.exe`）。

### 3.2 首次啟動（無設定檔）

不帶參數直接執行，使用內建預設值：

```bash
./mediamtx
```

預設會：

- 監聽 RTSP `:8554`
- 監聽 API `:9997`（僅 localhost）
- 監聽 WebRTC（HLS/WHEP 等）`:8889`

若要自訂設定，可建立 `mediamtx.yml`（見 [mediamtx 文件](https://mediamtx.org/docs/configuration/)），本階段可先不建，用預設即可。

### 3.3 驗證

- 瀏覽器開啟 `http://localhost:9997/v3/config/paths/list`，應回傳 JSON（可能為空 list）。
- 表示 mediamtx 與 API 正常。

---

## 四、步驟二：準備 RTSP 來源

Phase 1 至少需要一路「本機可連的 RTSP」，任選其一即可。

### 4.1 方案 A：ffmpeg 產生測試串流（推薦）

在本機用 ffmpeg 產生一路 RTSP，供 mediamtx 拉流。

**終端一：先啟動 mediamtx**（若尚未啟動）

```bash
./mediamtx
```

**終端二：ffmpeg 產生 RTSP**

```bash
ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 \
  -pix_fmt yuv420p -c:v libx264 -g 60 -keyint_min 60 \
  -preset ultrafast -b:v 800k -f rtsp rtsp://localhost:8554/teststream
```

- `testsrc`：測試圖（彩條＋時間戳），不需真實攝影機。
- 輸出到 `rtsp://localhost:8554/teststream`，表示由 mediamtx 的 RTSP 埠「接收」這路流（需 mediamtx 先有對應 path，見步驟三；或先用 runOnDemand 見下）。

若 mediamtx 尚未有 `teststream` path，可改用 **runOnDemand** 由 mediamtx 在有人訂閱時再啟動 ffmpeg（見步驟三）。

### 4.2 方案 B：mediamtx 用 runOnDemand 動態拉流

不先跑 ffmpeg，改由 mediamtx 在「有人訂閱時」再執行 ffmpeg 把流推到 mediamtx 自己。透過 API 新增 path 時設定 `runOnDemand`：

```bash
curl -X POST 'http://localhost:9997/v3/config/paths/add/teststream' \
  -H 'Content-Type: application/json' \
  -d '{
    "runOnDemand": "ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 -pix_fmt yuv420p -c:v libx264 -g 60 -keyint_min 60 -preset ultrafast -b:v 800k -f rtsp rtsp://localhost:8554/teststream"
  }'
```

- 第一次有客戶端連到 `teststream` 時，mediamtx 會執行上述指令，產生測試畫面。
- 注意：路徑名與 `rtsp://localhost:8554/` 後的 path 需一致（此例為 `teststream`）。

### 4.3 方案 C：公開測試 RTSP（若有）

若知道可用的公開 RTSP 測試 URL，可在新增 path 時直接設為 `source`（或等價設定），讓 mediamtx 主動拉該 URL。依 mediamtx 文件設定 `source` 欄位即可，此處不列具體 URL（公開測試源可能變動）。

### 4.4 用 VLC 驗證（可選）

- 若採方案 A：VLC 開啟 `rtsp://localhost:8554/teststream`（需先透過 API 新增 path，或 mediamtx 已設好該 path）。
- 若採方案 B：先呼叫上述 API 新增 `teststream`，再在瀏覽器或 VLC 連 `http://localhost:8889/teststream`（WebRTC/HLS）或對應 RTSP，確認有畫面。

---

## 五、步驟三：REST API 動態管理 path

### 5.1 新增 path（無 runOnDemand，外部已有 RTSP）

若 RTSP 已在別處（如另一台機器的攝影機或 ffmpeg 推流到 mediamtx 的 8554）：

```bash
curl -X POST 'http://localhost:9997/v3/config/paths/add/mystream' \
  -H 'Content-Type: application/json' \
  -d '{
    "source": "rtsp://localhost:8554/mystream"
  }'
```

- `mystream`：path 名稱，播放時用此名稱（如 `http://localhost:8889/mystream/whep`）。
- `source`：mediamtx 要拉的 RTSP 來源位址。

### 5.2 新增 path（runOnDemand，本機測試常用）

見 §4.2，path 名與 runOnDemand 內推流 path 一致：

```bash
curl -X POST 'http://localhost:9997/v3/config/paths/add/teststream' \
  -H 'Content-Type: application/json' \
  -d '{
    "runOnDemand": "ffmpeg -re -f lavfi -i testsrc=size=1280x720:rate=30 -pix_fmt yuv420p -c:v libx264 -g 60 -keyint_min 60 -preset ultrafast -b:v 800k -f rtsp rtsp://localhost:8554/teststream"
  }'
```

### 5.3 查詢現有 path

```bash
curl -s 'http://localhost:9997/v3/config/paths/list'
```

### 5.4 刪除 path

```bash
curl -X DELETE 'http://localhost:9997/v3/config/paths/remove/teststream'
```

- 刪除後，該 path 即不可播放，符合「軟性停用」情境。
- 注意：API 變更僅在記憶體，重啟 mediamtx 後會還原；Phase 2 再由 Backend 與 DB 管理 path／Token 與重啟還原邏輯。

---

## 六、步驟四：瀏覽器播放 WebRTC（驗證 mediamtx 輸出）

### 6.1 使用 mediamtx 內建播放頁（最簡）

mediamtx 預設在 WebRTC port 提供簡單播放介面，例如：

- 開啟 `http://localhost:8889/teststream`（將 `teststream` 換成你新增的 path 名稱）。
- 若有內建 UI，可直接在頁面中看到即時畫面，確認 WebRTC 輸出正常。

### 6.2 WebRTC 端點格式（供 Vue 整合）

- **WHEP（WebRTC 標準化拉流）**：`http://localhost:8889/{pathName}/whep`
- 例如：`http://localhost:8889/teststream/whep`

前端可用：

- 支援 WHEP 的播放器庫（如 **whep**、**webrtc-player** 等），或  
- mediamtx 提供的 **reader 範例**（若文件中有 `reader.js`），在 Vue 中掛到 `<video>` 的 `srcObject`。

### 6.3 Vue 3 最小驗證頁（建議產出）

在 construction-dashboard-frontend 內新增一個「Phase 1 驗證用」頁面或元件，例如：

- **路徑**：可放在專案內監測底下（如 `/p/:projectId/monitoring/media` 的實驗區），或暫時用獨立路由如 `/dev/camera-preview`（僅開發用）。
- **行為**：
  - 輸入或寫死 mediamtx 的 base URL（如 `http://localhost:8889`）與 path 名稱（如 `teststream`）。
  - 組出 WHEP URL：`{base}/{path}/whep`。
  - 使用 WHEP 客戶端庫或 mediamtx reader 取得 `MediaStream`，掛到 `<video ref="videoEl" autoplay muted playsinline>` 的 `srcObject`。
- **目的**：確認在實際 Vue 專案中可播出畫面，為 Phase 2「播放 URL 由 Backend 簽發、前端只接 URL」做準備。

若專案尚未引入 WHEP 庫，可先使用 mediamtx 官網文件中的 **Embed streams in a website** 範例（`reader.js` + `<video>`），再逐步改寫成 Vue 元件。

---

## 七、步驟五（可選）：本機跑 go2rtc

目的：模擬「現場主機主動推流到雲端 mediamtx」的情境。

### 7.1 下載 go2rtc

從 [go2rtc Releases](https://github.com/AlexxIT/go2rtc/releases) 下載對應 OS 的執行檔。

### 7.2 設定 go2rtc 推流到本機 mediamtx

- go2rtc 通常作為「現場端」：從內網攝影機拉 RTSP，再推到某個 RTSP 端點。
- 本機模擬：可設定 go2rtc 將一路來源（如 ffmpeg 或公開 RTSP）推到本機 mediamtx 的 `rtsp://localhost:8554/gostream`。
- 先在 mediamtx 用 API 新增 path `gostream`，source 設為 `rtsp://localhost:8554/gostream`（或 runOnReady 等，依 go2rtc 文件）；再在 go2rtc 設定中指定推流目標為 `rtsp://localhost:8554/gostream`。
- 啟動 go2rtc 後，在瀏覽器開啟 `http://localhost:8889/gostream`，確認能收到 go2rtc 推來的畫面。

此步驟驗證「現場推流 → mediamtx → 瀏覽器」方向正確，Phase 3 再處理 Token 與實際現場安裝。

---

## 八、驗收檢查表

完成以下即視為 Phase 1 通過：

| # | 項目 | 驗證方式 |
|---|------|----------|
| 1 | mediamtx 正常啟動 | `curl http://localhost:9997/v3/config/paths/list` 回傳 JSON |
| 2 | 可動態新增 path | POST `/v3/config/paths/add/{name}` 成功，list 中出現該 path |
| 3 | 有至少一路可播來源 | runOnDemand 或 ffmpeg 推流，path 顯示 ready 或有畫面 |
| 4 | 可動態刪除 path | DELETE `/v3/config/paths/remove/{name}` 後無法再播放 |
| 5 | 瀏覽器可播 WebRTC | 用內建頁或 Vue 頁播出 `http://localhost:8889/{path}/whep` 畫面 |
| 6 | （可選）go2rtc 推流 | go2rtc 推流到 mediamtx，瀏覽器可收看 |

---

## 九、Phase 1 產出與交接 Phase 2

### 9.1 建議產出

- **本機操作說明**：一頁摘要（如何啟動 mediamtx、如何用 curl 新增／刪除 path、如何用 ffmpeg 產生測試流）。
- **前端**：一個最小可用的「輸入 path + 播放 WebRTC」頁面或元件，路徑與程式碼位置記錄下來，供 Phase 2 改為接 Backend 的 `play-url` API。
- **筆記**：實際使用的 mediamtx / ffmpeg / go2rtc 版本與指令，以及遇到的問題與解法（可放在本文件或專案 wiki）。

### 9.2 進入 Phase 2 前

- 確認 Backend 將呼叫的 mediamtx API 格式（新增／刪除 path、list）已在本機驗證無誤。
- 確認前端播放流程（取得 URL → 掛到 video）可復用，Phase 2 僅改為「URL 從 Backend 取得」並加上權限與 Token 管理。

---

## 十、參考

- [mediamtx 官方文件](https://mediamtx.org/docs/)（Configuration、REST API、Playback、Embed in website）
- [mediamtx GitHub](https://github.com/bluenviron/mediamtx)
- [go2rtc GitHub](https://github.com/AlexxIT/go2rtc)
- 本專案：`docs/remote-camera-system-design.md`（整體架構與 Phase 2～4 範圍）

---

*Phase 1 詳細規劃 v1.0　2026 年 3 月*
