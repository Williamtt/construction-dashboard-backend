import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is not set')
}

const adapter = new PrismaPg({ connectionString })
export const prisma = new PrismaClient({ adapter })

/** 若略過 postinstall / 未執行 generate，執行期會缺少新 model，錯誤訊息難查 */
function assertPrismaDelegate(modelName: string, delegate: unknown): void {
  if (delegate == null || typeof delegate !== 'object') {
    throw new Error(
      `Prisma Client 缺少 ${modelName}（請執行 npx prisma generate 並重啟後端；若曾使用 npm install --ignore-scripts，請改為一般 install 或手動 prisma generate）`
    )
  }
}

const delegates = prisma as unknown as Record<string, unknown>
assertPrismaDelegate('repairRequest', delegates.repairRequest)
assertPrismaDelegate('constructionValuation', delegates.constructionValuation)
assertPrismaDelegate('constructionValuationLine', delegates.constructionValuationLine)
