#!/usr/bin/env node
/**
 * CI／本機：含 mergeParams 的專案子路由檔須在檔案前 35 行標註 @routeGuard，
 * 強制新 API 在 code review 時確認權限與稽核策略。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const routesDir = path.join(__dirname, '..', 'src', 'routes')

/** 非專案巢狀、或由 admin／平台路由處理者 */
const SKIP = new Set([
  'index.ts',
  'app-meta.ts',
  'auth.ts',
  'users.ts',
  'files.ts',
  'form-templates.ts',
  'alerts.ts',
  'announcements.ts',
  'platform-admin.ts',
  'platform-admin-monitoring.ts',
  'platform-admin-announcements.ts',
  'admin.ts',
  'projects.ts',
])

let failed = false
const files = fs.readdirSync(routesDir).filter((f) => f.endsWith('.ts'))

for (const name of files) {
  if (SKIP.has(name)) continue
  const full = path.join(routesDir, name)
  const text = fs.readFileSync(full, 'utf8')
  if (!text.includes('mergeParams: true')) continue
  const head = text.split('\n').slice(0, 35).join('\n')
  if (!head.includes('@routeGuard')) {
    console.error(`[check-route-guardrails] 缺少 @routeGuard 註記（檔案前 35 行）: src/routes/${name}`)
    failed = true
  }
}

if (failed) {
  console.error(
    '\n請在該路由檔頂部註解加上 @routeGuard，並說明權限在 service（assertProjectModuleAction）或路由 middleware（requireProjectModuleAction）。\n' +
      '詳見 .cursor/rules/api-route-guardrails.mdc'
  )
  process.exit(1)
}

console.log('[check-route-guardrails] OK')
