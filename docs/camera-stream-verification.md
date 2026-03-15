# 攝影機串流驗證清單

當儀表板看不到即時畫面時，可依此清單逐項確認。

## 一、後端與 mediamtx（本機）

| 項目 | 指令／方式 | 預期結果 |
|------|------------|----------|
| mediamtx API 可連 | `curl -s http://127.0.0.1:9997/v3/config/paths/list` | 回傳 JSON（含 `items` 等） |
| mediamtx 有在聽 RTMP | `lsof -i :1935` | 看到 `mediamtx` 在 LISTEN |
| mediamtx 有在聽 WebRTC | `lsof -i :8889` | 看到 `mediamtx` 在 LISTEN |
| 目前有無推流 | `curl -s http://127.0.0.1:9997/v3/paths/list` | 某個 path 的 `ready` 為 `true` 表示有推流 |

若 `ready` 全是 `false`，代表 **go2rtc 尚未成功推流到 mediamtx**，需檢查 go2rtc 端。

---

## 二、go2rtc（現場／你執行 run.sh 的那台電腦）

| 項目 | 方式 | 說明 |
|------|------|------|
| go2rtc 有在跑 | `ps aux \| grep go2rtc` | 應看到 `./go2rtc` 行程 |
| go2rtc 有在聽 | `lsof -i :1984` | 預設 Web UI 在 1984 |
| 設定檔是否正確 | 看同資料夾的 `go2rtc.yaml` | 必須有 `publish` 的 RTMP URL 與 `streams` 的 RTSP |
| 推流目標是否對 | `go2rtc.yaml` 的 `publish.STREAM_TOKEN` | key 必須與 stream 名稱相同；值為 `rtmp://HOST:1935/STREAM_TOKEN` |
| 是否有來源可推 | `go2rtc.yaml` 的 `streams.STREAM_TOKEN` | 建議用 `ffmpeg:rtsp://...#video=h264#audio=aac` 以符合 RTMP 推流 |
| go2rtc 與 mediamtx 同機 | `go2rtc.yaml` 頂部加 `rtsp: listen: ":8556"` | 避免與 mediamtx 的 8554 衝突，否則會出現 rtsp module disabled |
| go2rtc 是否在推 | 瀏覽器開 http://localhost:1984 | 看對應 stream 是否為 playing／有畫面 |

---

## 三、常見狀況

1. **mediamtx 與 go2rtc 不在同一台**  
   下載的 `go2rtc.yaml` 裡 RTMP 是 `rtmp://localhost:1935/...`，只適合 **mediamtx 和 go2rtc 都在本機**。若 mediamtx 在別台機器，需在後端設定 `MEDIAMTX_PUBLIC_HOST`（與 `MEDIAMTX_RTMP_PORT`），重新下載安裝包才會拿到正確的 RTMP URL。

2. **go2rtc 沒有可用的 RTSP 來源**  
   `streams` 裡是範例或錯的 IP／帳密，go2rtc 拉不到 RTSP，就不會推任何東西到 mediamtx。

3. **go2rtc 讀不到設定**  
   go2rtc 預設讀取執行時工作目錄的 `go2rtc.yaml`。請在 **放有 go2rtc.yaml 的資料夾** 裡執行 `./go2rtc`（或 `./run.sh`），不要在其他目錄執行。

---

## 四、本機快速檢查指令（後端專案目錄可跑）

```bash
# mediamtx 是否在跑、是否有 path 已 ready
curl -s http://127.0.0.1:9997/v3/paths/list | jq .
# 若沒有 jq，直接：curl -s http://127.0.0.1:9997/v3/paths/list
```

看到你要的那個 path 的 `"ready": true` 後，儀表板重新整理後應會顯示「線上」並有畫面。

---

## 五、手動用 ffmpeg 測試 mediamtx 是否收得到 RTMP

若 go2rtc 一直沒讓 path 變 ready，可先用 ffmpeg 手動推流，確認 mediamtx 會收：

```bash
# 把 STREAM_TOKEN 換成你的攝影機 token（例如 712ef083-534b-46ba-9649-0e6de1c12649）
# 先確認 path 已存在（mediamtx 重啟後需用 API 重新 add path）：
# curl -X POST "http://127.0.0.1:9997/v3/config/paths/add/STREAM_TOKEN" -H "Content-Type: application/json" -d '{"source":"publisher"}'

# 含影像+音軌較不易被伺服器關閉連線
ffmpeg -re -f lavfi -i testsrc=size=320x240:rate=30 -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \\
  -c:v libx264 -preset ultrafast -c:a aac -f flv rtmp://localhost:1935/STREAM_TOKEN
```

另開終端執行 `curl -s http://127.0.0.1:9997/v3/paths/list`，若該 path 的 `ready` 變成 `true`，代表 mediamtx 收 RTMP 正常，問題在 go2rtc 的 publish。可再檢查 go2rtc 啟動時的 log 是否有 publish／rtmp 相關錯誤。
