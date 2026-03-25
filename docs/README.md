# 文件索引（後端）

開發約定以 **`.cursor/rules/`** 為準（`project-overview`、`api-contract`、`prisma-database`、`soft-delete` 等）。此目錄補充 API、部署、串流與領域設計。

## 核心架構

| 文件 | 說明 |
|------|------|
| [backend-structure-notes.md](./backend-structure-notes.md) | 路由／模組分層、`asyncHandler`、擴充慣例 |
| [backend-prisma-api.md](./backend-prisma-api.md) | 主要 REST 資源與權限對照摘要 |
| [soft-delete.md](./soft-delete.md) | 軟刪欄位、查詢、partial unique |
| [project-module-permissions.md](./project-module-permissions.md) | 專案內 RBAC、**新增模組 checklist** |

## 部署與正式環境

| 文件 | 說明 |
|------|------|
| [deployment-setup-guide.md](./deployment-setup-guide.md) | Railway、Vercel、Cloudflare R2 逐步架設（`prod`） |
| [production-release-checklist.md](./production-release-checklist.md) | 發布前檢查 |
| [production-environment-planning.md](./production-environment-planning.md) | 正式環境規劃與檢核 |
| [docker-database.md](./docker-database.md) | 本機 Docker PostgreSQL（可選） |
| [local-network-access.md](./local-network-access.md) | 區網存取後端注意事項 |

## 檔案與安全

| 文件 | 說明 |
|------|------|
| [file-upload.md](./file-upload.md) | 上傳、R2／本機儲存 |
| [security-dependencies.md](./security-dependencies.md) | 依賴與安全相關紀錄 |

## 攝影機與 mediamtx

| 文件 | 說明 |
|------|------|
| [remote-camera-system-design.md](./remote-camera-system-design.md) | 系統設計總覽 |
| [camera-streaming-pipeline-summary.md](./camera-streaming-pipeline-summary.md) | **管線邏輯、環境變數、踩坑**（維運首選） |
| [camera-stream-verification.md](./camera-stream-verification.md) | 無畫面時驗證清單 |
| [mediamtx-backend-ports.md](./mediamtx-backend-ports.md) | mediamtx 與後端連線埠 |
| [mediamtx-webrtc-troubleshooting.md](./mediamtx-webrtc-troubleshooting.md) | WebRTC 疑難 |

## 施工／契約領域

| 文件 | 說明 |
|------|------|
| [construction-daily-log-system-inventory.md](./construction-daily-log-system-inventory.md) | 施工日誌系統盤點 |
| [construction-daily-log-full-flow-spec.md](./construction-daily-log-full-flow-spec.md) | 全流程規格 |
| [construction-valuation-billing-snapshot.md](./construction-valuation-billing-snapshot.md) | 估驗計價快照設計 |
| [wbs-resource-cost-design.md](./wbs-resource-cost-design.md) | WBS 資源成本設計 |

## 多租戶與平台

| 文件 | 說明 |
|------|------|
| [multi-tenant-and-product-gap-analysis.md](./multi-tenant-and-product-gap-analysis.md) | 多租戶、客戶端部署、產品差距 |
| [platform-monitoring-audit.md](./platform-monitoring-audit.md) | 平台方監控與稽核規劃 |
