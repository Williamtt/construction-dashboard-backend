/**
 * 一次性補全：construction.supervision 模組後加，
 * 既有 TenantPermissionTemplate 與 ProjectMemberPermission 缺少該列。
 *
 * 補全邏輯：
 *   - 同 (tenantId/projectId, userId) 若有 construction.diary canCreate=true
 *     → supervision 給全權（工地主任等級）
 *   - 否則 → canRead=true（一般可見）
 *
 * 執行：npx tsx scripts/backfill-supervision-permission.ts
 * 需 DATABASE_URL
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const MODULE = 'construction.supervision'
const DIARY = 'construction.diary'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) })

async function backfillTemplates() {
  // 找出所有有 template 但缺 supervision 的 (tenantId, userId)
  const existing = await prisma.tenantPermissionTemplate.findMany({
    where: { module: MODULE },
    select: { tenantId: true, userId: true },
  })
  const existingSet = new Set(existing.map((r) => `${r.tenantId}:${r.userId}`))

  const allPairs = await prisma.tenantPermissionTemplate.findMany({
    distinct: ['tenantId', 'userId'],
    select: { tenantId: true, userId: true },
  })
  const missing = allPairs.filter((r) => !existingSet.has(`${r.tenantId}:${r.userId}`))

  if (!missing.length) {
    console.log('[template] 無需補全，所有 template 已有 supervision 列')
    return
  }
  console.log(`[template] 需補全 ${missing.length} 筆`)

  // 查 diary canCreate 判斷等級
  const diaryRows = await prisma.tenantPermissionTemplate.findMany({
    where: {
      module: DIARY,
      OR: missing.map((r) => ({ tenantId: r.tenantId, userId: r.userId })),
    },
    select: { tenantId: true, userId: true, canCreate: true },
  })
  const diaryFullSet = new Set(
    diaryRows.filter((r) => r.canCreate).map((r) => `${r.tenantId}:${r.userId}`)
  )

  const data = missing.map((r) => {
    const full = diaryFullSet.has(`${r.tenantId}:${r.userId}`)
    return {
      tenantId: r.tenantId,
      userId: r.userId,
      module: MODULE,
      canCreate: full,
      canRead: true,
      canUpdate: full,
      canDelete: full,
    }
  })

  await prisma.tenantPermissionTemplate.createMany({ data, skipDuplicates: true })
  const fullCount = data.filter((d) => d.canCreate).length
  console.log(`[template] 補全完成：${fullCount} 筆全權，${data.length - fullCount} 筆唯讀`)
}

async function backfillProjectPermissions() {
  const existing = await prisma.projectMemberPermission.findMany({
    where: { module: MODULE },
    select: { projectId: true, userId: true },
  })
  const existingSet = new Set(existing.map((r) => `${r.projectId}:${r.userId}`))

  const allPairs = await prisma.projectMemberPermission.findMany({
    distinct: ['projectId', 'userId'],
    select: { projectId: true, userId: true },
  })
  const missing = allPairs.filter((r) => !existingSet.has(`${r.projectId}:${r.userId}`))

  if (!missing.length) {
    console.log('[project] 無需補全，所有專案成員已有 supervision 列')
    return
  }
  console.log(`[project] 需補全 ${missing.length} 筆`)

  const diaryRows = await prisma.projectMemberPermission.findMany({
    where: {
      module: DIARY,
      OR: missing.map((r) => ({ projectId: r.projectId, userId: r.userId })),
    },
    select: { projectId: true, userId: true, canCreate: true },
  })
  const diaryFullSet = new Set(
    diaryRows.filter((r) => r.canCreate).map((r) => `${r.projectId}:${r.userId}`)
  )

  const data = missing.map((r) => {
    const full = diaryFullSet.has(`${r.projectId}:${r.userId}`)
    return {
      projectId: r.projectId,
      userId: r.userId,
      module: MODULE,
      canCreate: full,
      canRead: true,
      canUpdate: full,
      canDelete: full,
    }
  })

  await prisma.projectMemberPermission.createMany({ data, skipDuplicates: true })
  const fullCount = data.filter((d) => d.canCreate).length
  console.log(`[project] 補全完成：${fullCount} 筆全權，${data.length - fullCount} 筆唯讀`)
}

async function main() {
  try {
    await backfillTemplates()
    await backfillProjectPermissions()
    console.log('全部完成')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
