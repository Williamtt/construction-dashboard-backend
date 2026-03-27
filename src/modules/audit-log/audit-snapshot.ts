/**
 * 將值轉成可安全寫入 audit_logs.details（JSON）的結構（Date → ISO、Decimal → 字串等）。
 */
export function serializeAuditValue(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map((x) => serializeAuditValue(x))
  if (typeof value === 'object' && value !== null && 'toFixed' in value && typeof (value as { toFixed: (n?: number) => string }).toFixed === 'function') {
    return String(value)
  }
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o)) {
      out[k] = serializeAuditValue(o[k])
    }
    return out
  }
  return value
}

/** 標準化變更稽核：before / after（與既有 project.update 對齊） */
export function auditDetailsBeforeAfter(before: unknown, after: unknown): Record<string, unknown> {
  return {
    before: serializeAuditValue(before),
    after: serializeAuditValue(after),
  }
}

/** 軟刪或僅需刪前快照 */
export function auditDetailsBeforeOnly(before: unknown): Record<string, unknown> {
  return { before: serializeAuditValue(before) }
}
