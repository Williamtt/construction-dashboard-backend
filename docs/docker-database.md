# PostgreSQL Docker 本地開發指南

本專案使用 **PostgreSQL 16** 搭配 **Docker** 作為本地開發資料庫。

---

## 一、前置需求

- 已安裝 [Docker](https://docs.docker.com/get-docker/) 與 Docker Compose（Docker Desktop 已內含）

---

## 二、啟動資料庫

在專案根目錄執行：

```bash
docker compose up -d
```

- `-d`：背景執行
- 首次會拉取 `postgres:16` 映像並建立 volume `pg_data` 持久化資料

確認容器已啟動且健康：

```bash
docker compose ps
```

應看到 `construction-dashboard-postgres` 狀態為 `running`，health 為 `healthy`。

---

## 三、連線資訊

| 項目 | 值 |
|------|-----|
| Host | `localhost`（本機連線） |
| Port | `5435` |
| Database | `construction_dashboard` |
| User | `postgres` |
| Password | `postgres` |

**DATABASE_URL（本機連線）：**

```
postgresql://postgres:postgres@localhost:5435/construction_dashboard
```

---

## 四、後端 .env 設定

在專案根目錄複製 `.env.example` 為 `.env`，並設定：

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/construction_dashboard
```

其餘變數（PORT、JWT_SECRET、CORS_ORIGIN 等）依 `.env.example` 與需求填寫。

---

## 五、常用指令

| 指令 | 說明 |
|------|------|
| `docker compose up -d` | 啟動 PostgreSQL（背景） |
| `docker compose down` | 停止並移除容器（volume 保留） |
| `docker compose down -v` | 停止並移除容器與 volume（**會刪除所有資料**） |
| `docker compose logs -f postgres` | 查看 postgres 日誌 |
| `docker exec -it construction-dashboard-postgres psql -U postgres -d construction_dashboard` | 進入 DB 的 psql |

---

## 六、後端在 Docker 內連線 Postgres（可選）

若後端也跑在 Docker（例如用 docker-compose 一起起 backend），需讓 backend 連到 postgres 容器：

- **Mac / Windows Docker Desktop**：Host 可用 `host.docker.internal`，本機 postgres 對外已開 5435 時，backend 的 `DATABASE_URL` 設為：
  ```text
  postgresql://postgres:postgres@host.docker.internal:5435/construction_dashboard
  ```
- **同一 compose 內**：可新增 `backend` service，與 `postgres` 同 network，則 Host 用服務名 `postgres`：
  ```text
  postgresql://postgres:postgres@postgres:5432/construction_dashboard
  ```

目前本 compose 僅定義 **postgres**，後端一般在本機用 `localhost` 連線即可。

---

## 七、建立資料表

本專案使用 `pg` 套件直連，尚未使用 Prisma / migration 工具前，可：

1. 手動在 psql 或 GUI（如 DBeaver、pgAdmin）執行 SQL 建表；
2. 或之後在專案內加入 migration 腳本 / 工具，再於此文件補充執行方式。

連線後即可建立對應多專案、多租戶規劃的 schema（參考 `multi-project-multi-tenant-planning.md`）。
