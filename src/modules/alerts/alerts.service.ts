import type { AlertLevel } from '../../types/alerts.js'
import { assertCanAccessProject } from '../../shared/project-access.js'
import { assertProjectModuleAction } from '../project-permission/project-permission.service.js'
import { alertsRepository } from './alerts.repository.js'

type AlertsAuthUser = {
  id: string
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

export type AlertItemDto = {
  id: string
  level: AlertLevel
  title: string
  value: string
  description?: string
  /** 最後一次發生時間（ISO 字串），前端用於顯示「已過 X 分鐘」 */
  lastSeenAt: string
}

/**
 * 取得目前有效警報（30 分鐘內有發生的才顯示）。
 * 僅讀取 DB（由後續 CWA／匯入管線寫入）；已排除舊版 `source=mock` 測試資料。
 */
export async function getCurrentAlerts(projectId: string | null | undefined, user: AlertsAuthUser): Promise<AlertItemDto[]> {
  const projId = projectId ?? null

  if (projId) {
    await assertCanAccessProject(user, projId)
    await assertProjectModuleAction(user, projId, 'construction.monitor', 'read')
  }

  const rows = await alertsRepository.findCurrentWithinMinutes(projId, 30)
  return rows.map((r) => ({
    id: r.id,
    level: r.level as AlertLevel,
    title: r.title,
    value: r.value,
    description: r.description ?? undefined,
    lastSeenAt: r.lastSeenAt.toISOString(),
  }))
}

/**
 * 歷史警報（從 alert_history_records 查詢）
 */
export async function getAlertHistory(params: {
  projectId?: string | null
  user: AlertsAuthUser
  startDate: Date
  endDate: Date
  limit?: number
}): Promise<Array<AlertItemDto & { createdAt: string }>> {
  const projId = params.projectId ?? null
  if (projId) {
    await assertCanAccessProject(params.user, projId)
    await assertProjectModuleAction(params.user, projId, 'construction.monitor', 'read')
  }
  const rows = await alertsRepository.findHistoryByDateRange({
    projectId: projId,
    startDate: params.startDate,
    endDate: params.endDate,
    limit: params.limit,
  })
  return rows.map((r) => ({
    id: r.id,
    level: r.level as AlertLevel,
    title: r.title,
    value: r.value,
    description: r.description ?? undefined,
    lastSeenAt: r.createdAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  }))
}
