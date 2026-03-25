# Construction Dashboard — Backend

Node.js + Express + TypeScript + Zod + JWT + **PostgreSQL（Prisma 7）** + Cloudflare R2（S3 相容檔案儲存）。API 前綴為 **`/api/v1`**。

---

## 技術棧摘要

| 項目 | 說明 |
|------|------|
| Runtime | Node.js |
| 框架 | Express |
| ORM | Prisma 7（`src/lib/db.ts` 單例） |
| 資料庫 | PostgreSQL |
| 驗證 | Zod |
| 認證 | JWT + bcrypt |
| 檔案 | 開發可 `local`，正式建議 Cloudflare R2 |

---

## 資料庫（PostgreSQL）

### 本機開發（Docker，建議）

專案根目錄已提供 `docker-compose.yml`（PostgreSQL 16）。

```bash
docker compose up -d
docker compose ps   # 確認 healthy
```

| 項目 | 值 |
|------|-----|
| Host | `localhost` |
| Port | **5435**（對外）→ 容器內 5432 |
| Database | `construction_dashboard` |
| User / Password | `postgres` / `postgres` |

**`DATABASE_URL` 範例：**

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/construction_dashboard
```

更細的說明與疑難排解見 **`docs/docker-database.md`**。

### 正式環境（例如 Railway）

1. 在雲端建立 **PostgreSQL** 服務，取得連線字串（通常為 `postgresql://user:pass@host:5432/dbname`）。
2. 設為 **`DATABASE_URL`**（勿提交到 Git）。
3. **每次部署**在啟動前執行 migration（見下方「部署流程」），確保 schema 與程式一致。

### Migration 與 Prisma

```bash
# 本機建立／套用 migration（開發）
npm run db:migrate:dev -- --name 描述

# 正式／CI：只套用既有 migration（不互動）
npm run db:migrate
# 等同 npx prisma migrate deploy
```

其他常用指令：

- `npm run db:studio` — Prisma Studio（瀏覽資料）
- `npm run db:seed` — 種子資料（含測試帳號）
- `npm run db:reset` — 重設 DB 並重新 seed（**僅開發**）

Schema 定義：`prisma/schema.prisma`。連線設定：`prisma.config.ts`（讀取 `DATABASE_URL`）。

---

## 環境變數

1. 複製 **`.env.example`** 為 **`.env`**
2. 至少填寫：`DATABASE_URL`、`JWT_SECRET`（正式環境請用強隨機字串，例如 `openssl rand -base64 32`）

| 變數 | 說明 |
|------|------|
| `PORT` | 預設 `3003` |
| `NODE_ENV` | `development` / `production` |
| `DATABASE_URL` | PostgreSQL 連線字串 |
| `JWT_SECRET` | 簽發 access token（必填） |
| `JWT_REFRESH_SECRET` | refresh token（若使用） |
| `CORS_ORIGIN` | 允許的前端 origin，**多個以逗號分隔**。正式環境**必設**，否則 production 下不允許跨來源 |
| `FILE_STORAGE_TYPE` | `local` 或 `r2` |
| `FILE_STORAGE_LOCAL_PATH` | local 時儲存目錄（預設 `./storage`） |
| `R2_*` | R2 的 endpoint、金鑰、bucket、公開 URL 等（見 `.env.example`） |
| `JSON_BODY_LIMIT` | 選填，大 JSON 用（例 `20mb`） |

攝影機／串流相關（go2rtc、mediamtx）見 `.env.example` 註解。

---

## 本機開發流程

```bash
npm install
cp .env.example .env
# 編輯 .env：DATABASE_URL、JWT_SECRET、CORS_ORIGIN（含 http://localhost:5175 等）

docker compose up -d
npm run db:migrate:dev   # 或已有人跑過則 npm run db:migrate
npm run db:seed          # 可選：測試帳號（密碼見 seed／登入頁說明，常為 password123）

npm run dev              # http://localhost:3003（tsx watch）
```

- 健康檢查：`GET http://localhost:3003/health`
- API 根：`GET http://localhost:3003/api/v1`

### 與前端／App 對接

- 瀏覽器前端：`CORS_ORIGIN` 需包含前端網址（本機例：`http://localhost:5175`；用手機連區網 IP 時也要把該 origin 加進去）。
- **iOS App**：原生請求不受 CORS 限制，但仍需後端 **HTTPS**（App Store／ATS）與正確的 API 網址；見 constructionApp 的 README。

### 若無法登入

1. `.env` 有 `JWT_SECRET`
2. 前端 `VITE_API_URL` 或 App `API_BASE_URL` 指向正確的 host + `/api/v1`（App）或 host（前端，路徑在程式內為 `/api/v1/...`）
3. 已 `db:seed` 且 DB 可連
4. 開發時 500 可看後端 terminal 或回應中的 `error.details`（若開啟）

---

## 建置與本機模擬正式啟動

```bash
npm run build    # tsc → dist/
npm start        # node dist/index.js
```

---

## 正式環境部署（範例：Railway）

實際按鈕名稱依平台為準，重點步驟如下。

1. **建立服務**：連結 GitHub 此 repo，或 Docker／Nixpacks 部署 Node 專案。
2. **附加 PostgreSQL**：平台會注入 `DATABASE_URL`（或手動貼上）。
3. **環境變數**（在平台 UI 設定，勿進 repo）：
   - `NODE_ENV=production`
   - `JWT_SECRET`、`JWT_REFRESH_SECRET`（強隨機）
   - `CORS_ORIGIN`：**你的前端正式網址**（例 `https://your-app.vercel.app`），多個逗號分隔
   - `FILE_STORAGE_TYPE=r2` 並填滿 `R2_*`（或維持 local 僅限不建議的簡易情境）
4. **Build**：`npm install`（postinstall 會 `prisma generate`）+ `npm run build`
5. **Release / 部署前指令**（強烈建議）：`npx prisma migrate deploy`  
   - 確保新程式上線前資料庫結構已更新
6. **Start**：`npm start`（`node dist/index.js`）
7. **公開網域**：記下 HTTPS 根網址（例 `https://xxx.up.railway.app`），供前端 `VITE_API_URL` 與 App `API_BASE_URL` 使用。

### GitHub Actions / CI

在可連 `DATABASE_URL` 的環境執行 `npx prisma migrate deploy`，再觸發或銜接部署。

---

## 其他指令

- `npm run lint` / `npm run format`
- `npm run generate:progress-template` 等：見 `package.json` scripts

---

## API 速查

- `GET /health` — 健康檢查
- `GET /api/v1` — API 根
- 完整路由實作於 `src/routes/`、`src/modules/`

---

## 相關文件

- `docs/docker-database.md` — 本機 PostgreSQL Docker
- `docs/soft-delete.md` — 軟刪除與查詢約定（若適用）
