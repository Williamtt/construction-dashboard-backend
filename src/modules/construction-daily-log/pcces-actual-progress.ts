import { Prisma } from '@prisma/client'

export type PccesRootRow = {
  itemKey: number
  parentItemKey: number | null
  itemNo: string
  description: string
  amountImported: Prisma.Decimal | null
}

/**
 * 取「壹、發包工程費」等頂層契約總金額（XML rollup 後之 amountImported）。
 * 優先 description／項次含 發包、工程費、壹；否則取 parent 為 null 中 itemKey 最小者。
 */
export function pickPccesContractTotalAmount(rows: PccesRootRow[]): Prisma.Decimal | null {
  const roots = rows.filter((r) => r.parentItemKey === null)
  if (roots.length === 0) return null
  const scored = roots.map((r) => {
    let score = 0
    const d = r.description
    const no = r.itemNo
    if (/發包/.test(d) || /發包/.test(no)) score += 3
    if (/工程費/.test(d)) score += 3
    if (/壹/.test(d) || /^壹/.test(no.trim())) score += 2
    return { r, score }
  })
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.r.itemKey - b.r.itemKey
  })
  const pick = scored[0]!.r
  const amt = pick.amountImported
  if (amt == null || amt.lte(0)) return null
  return amt
}

/** 金額加權實際進度 %，四捨五入至小數 2 位 */
export function actualProgressPercentFromAmounts(
  weightedDone: Prisma.Decimal,
  contractTotal: Prisma.Decimal
): string {
  if (contractTotal.lte(0)) return '0'
  const hundred = new Prisma.Decimal(100)
  const raw = weightedDone.div(contractTotal).mul(hundred)
  return raw.toDecimalPlaces(2).toString()
}
