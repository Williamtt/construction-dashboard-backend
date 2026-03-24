import { Prisma } from '@prisma/client'

/** 各期累計預定：若該列有 Excel 累計則採用，否則自本期加總 */
export function plannedCumulativeSeries(
  rows: Array<{
    periodProgress: Prisma.Decimal | null
    cumulativeProgress: Prisma.Decimal | null
  }>
): string[] {
  let running = new Prisma.Decimal(0)
  return rows.map((e) => {
    if (e.cumulativeProgress != null) {
      running = new Prisma.Decimal(e.cumulativeProgress.toString())
    } else if (e.periodProgress != null) {
      running = running.plus(e.periodProgress)
    }
    return running.toString()
  })
}
