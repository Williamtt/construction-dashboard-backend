/**
 * 施工日誌「預定進度 %」：優先依進度管理之累計預定節點（須為填表日已生效計畫版本，含變更後曲線）做日曆內插；
 * 否則依開工日＋核定工期線性推算。
 */

function formatDateOnlyUtc(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 日曆天數（含起訖日）；若 log 早於開工，回傳 0。 */
function elapsedCalendarDaysInclusive(start: Date, log: Date): number {
  const ua = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())
  const ub = Date.UTC(log.getUTCFullYear(), log.getUTCMonth(), log.getUTCDate())
  const diff = Math.floor((ub - ua) / 86400000) + 1
  return Math.max(0, diff)
}

/** 無進度表時：依開工日與核定工期線性比例，上限 100 */
export function computePlannedProgressLinearPercent(params: {
  logDate: Date
  startDate: Date | null
  approvedDurationDays: number | null
}): number | null {
  const { logDate, startDate, approvedDurationDays } = params
  if (!startDate || approvedDurationDays == null || approvedDurationDays <= 0) return null
  const elapsed = elapsedCalendarDaysInclusive(startDate, logDate)
  if (elapsed === 0) return 0
  const raw = (elapsed / approvedDurationDays) * 100
  return Math.round(Math.min(100, Math.max(0, raw)) * 100) / 100
}

function ymdToUtcDayIndex(ymd: string): number | null {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!y || !mo || !d) return null
  return Math.floor(Date.UTC(y, mo - 1, d) / 86400000)
}

function roundClampPct(x: number): number {
  return Math.round(Math.min(100, Math.max(0, x)) * 100) / 100
}

/**
 * 依主計畫各期「時間區間」與「累計預定 %」做分段線性內插，得到填表日之累計預定 %。
 * 左端點：開工日（若早於第一期且表單有開工日）為 0%；否則為第一期前一曆日、0%。
 */
export function interpolatePlannedPercentFromPlanKnots(
  logDateYmd: string,
  startDateYmd: string | null,
  knots: Array<{ periodDate: string; cumulativePlanned: string }>
): number | null {
  if (!knots.length) return null
  const logT = ymdToUtcDayIndex(logDateYmd)
  if (logT == null) return null

  const sorted = [...knots].sort((a, b) => a.periodDate.localeCompare(b.periodDate))
  const parsed: { t: number; c: number }[] = []
  for (const k of sorted) {
    const t = ymdToUtcDayIndex(k.periodDate)
    const c = Number(String(k.cumulativePlanned).replace(/,/g, ''))
    if (t == null || !Number.isFinite(c)) continue
    parsed.push({ t, c })
  }
  if (!parsed.length) return null

  const firstT = parsed[0]!.t
  const st = startDateYmd ? ymdToUtcDayIndex(startDateYmd) : null
  const anchorT = st != null && st < firstT ? st : firstT - 1

  const points: { t: number; c: number }[] = [{ t: anchorT, c: 0 }]
  for (const p of parsed) {
    const last = points[points.length - 1]!
    if (last.t === p.t) {
      points[points.length - 1] = p
    } else {
      points.push(p)
    }
  }
  points.sort((a, b) => a.t - b.t)

  if (logT < points[0]!.t) {
    return roundClampPct(points[0]!.c)
  }
  if (logT >= points[points.length - 1]!.t) {
    return roundClampPct(points[points.length - 1]!.c)
  }

  let i = 0
  while (i < points.length - 1 && points[i + 1]!.t < logT) {
    i++
  }
  const a = points[i]!
  const b = points[i + 1]!
  if (!b || b.t <= a.t) {
    return roundClampPct(a.c)
  }
  const f = (logT - a.t) / (b.t - a.t)
  return roundClampPct(a.c + f * (b.c - a.c))
}

export function resolvePlannedProgressForDailyLog(params: {
  logDate: Date
  startDate: Date | null
  approvedDurationDays: number | null
  knots: Array<{ periodDate: string; cumulativePlanned: string }> | null
}): number | null {
  const logYmd = formatDateOnlyUtc(params.logDate)
  const startYmd = params.startDate ? formatDateOnlyUtc(params.startDate) : null
  if (params.knots && params.knots.length > 0) {
    const v = interpolatePlannedPercentFromPlanKnots(logYmd, startYmd, params.knots)
    if (v !== null) return v
  }
  return computePlannedProgressLinearPercent({
    logDate: params.logDate,
    startDate: params.startDate,
    approvedDurationDays: params.approvedDurationDays,
  })
}
