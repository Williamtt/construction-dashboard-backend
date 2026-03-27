import type { Request } from 'express'
import type { Prisma } from '@prisma/client'
import { auditLogRepository } from './audit-log.repository.js'
import { auditDetailsBeforeAfter, auditDetailsBeforeOnly, serializeAuditValue } from './audit-snapshot.js'

function getIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? null
  return req.ip ?? null
}

function getUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent']
  return typeof ua === 'string' ? ua : null
}

export type AuditRecordParams = {
  action: string
  resourceType: string
  resourceId?: string | null
  tenantId?: string | null
  details?: Prisma.InputJsonValue
}

/**
 * 寫入一筆稽核日誌（可由各 route 在操作成功後呼叫）。
 * 不阻塞回應，寫入失敗僅 log，不拋出。
 */
export async function recordAudit(req: Request, params: AuditRecordParams): Promise<void> {
  const userId = req.user?.id ?? null
  try {
    await auditLogRepository.create({
      userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      tenantId: params.tenantId ?? null,
      details: params.details ?? null,
      ipAddress: getIp(req),
      userAgent: getUserAgent(req),
    })
  } catch (e) {
    console.error('auditLog.record', params.action, e)
  }
}

export type RecordAuditMutationParams = {
  action: string
  resourceType: string
  resourceId?: string | null
  tenantId?: string | null
  /** 變更前快照（必填） */
  before: unknown
  /** 變更後；省略時視為僅記錄刪除前狀態等 */
  after?: unknown
  /** 併入 details 的其它欄位（會一併序列化） */
  extra?: Record<string, unknown>
}

/**
 * 變更／刪除稽核：details 固定含 { before, after? }，與專案 update 等一致。
 */
export async function recordAuditMutation(req: Request, params: RecordAuditMutationParams): Promise<void> {
  const base =
    params.after !== undefined
      ? auditDetailsBeforeAfter(params.before, params.after)
      : auditDetailsBeforeOnly(params.before)
  const details = (
    params.extra && Object.keys(params.extra).length > 0
      ? { ...base, extra: serializeAuditValue(params.extra) }
      : base
  ) as Prisma.InputJsonValue
  await recordAudit(req, {
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    tenantId: params.tenantId,
    details,
  })
}
