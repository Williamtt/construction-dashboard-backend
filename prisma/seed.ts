/**
 * 資料庫 seed：建立預設租戶、人員、專案與專案成員（開發／展示用）
 * 執行：npm run db:seed 或 prisma migrate reset 時會自動執行
 *
 * 與軟刪除相容：email／slug 以「未刪除列」為準；若僅存在已刪除列則還原並更新欄位。
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcrypt'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required for seed')
}

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

const notDeleted = { deletedAt: null } as const

async function ensureTenantBySlug(slug: string, createData: { name: string; slug: string }) {
  let row = await prisma.tenant.findFirst({ where: { slug, ...notDeleted } })
  if (row) return row
  const soft = await prisma.tenant.findFirst({ where: { slug, deletedAt: { not: null } } })
  if (soft) {
    row = await prisma.tenant.update({
      where: { id: soft.id },
      data: { deletedAt: null, deletedById: null, name: createData.name },
    })
    return row
  }
  return prisma.tenant.create({ data: createData })
}

async function ensureUserByEmail(
  email: string,
  createData: {
    email: string
    passwordHash: string
    name: string
    systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
    tenantId: string | null
  }
) {
  let row = await prisma.user.findFirst({ where: { email, ...notDeleted } })
  if (row) {
    await prisma.user.update({
      where: { id: row.id },
      data: {
        passwordHash: createData.passwordHash,
        name: createData.name,
        systemRole: createData.systemRole,
        tenantId: createData.tenantId,
        status: 'active',
      },
    })
    row = await prisma.user.findFirst({ where: { id: row.id, ...notDeleted } })
    return row!
  }
  const soft = await prisma.user.findFirst({ where: { email, deletedAt: { not: null } } })
  if (soft) {
    row = await prisma.user.update({
      where: { id: soft.id },
      data: {
        deletedAt: null,
        deletedById: null,
        passwordHash: createData.passwordHash,
        name: createData.name,
        systemRole: createData.systemRole,
        tenantId: createData.tenantId,
        status: 'active',
      },
    })
    return row
  }
  return prisma.user.create({ data: createData })
}

async function ensureProjectMember(
  projectId: string,
  userId: string,
  role: 'project_admin' | 'member' | 'viewer'
) {
  const active = await prisma.projectMember.findFirst({ where: { projectId, userId, ...notDeleted } })
  if (active) return
  const anyRow = await prisma.projectMember.findFirst({ where: { projectId, userId } })
  if (anyRow?.deletedAt != null) {
    await prisma.projectMember.update({
      where: { id: anyRow.id },
      data: { deletedAt: null, deletedById: null, role, status: 'active' },
    })
    return
  }
  await prisma.projectMember.create({
    data: { projectId, userId, role },
  })
}

async function main() {
  console.log('Seeding...')

  const tenant = await ensureTenantBySlug('default', {
    name: '預設租戶',
    slug: 'default',
  })
  console.log('Tenant:', tenant.name)

  const passwordHash = await bcrypt.hash('password123', 10)

  const admin = await ensureUserByEmail('admin@example.com', {
    email: 'admin@example.com',
    passwordHash,
    name: '系統管理員',
    systemRole: 'tenant_admin',
    tenantId: tenant.id,
  })
  console.log('User (admin):', admin.email)

  const member = await ensureUserByEmail('member@example.com', {
    email: 'member@example.com',
    passwordHash,
    name: '專案成員',
    systemRole: 'project_user',
    tenantId: tenant.id,
  })
  console.log('User (member):', member.email)

  const platformAdmin = await ensureUserByEmail('platform@example.com', {
    email: 'platform@example.com',
    passwordHash,
    name: '平台管理員',
    systemRole: 'platform_admin',
    tenantId: null,
  })
  console.log('User (platform):', platformAdmin.email)

  const proj1 = await prisma.project.upsert({
    where: { id: 'seed-proj-1' },
    update: {},
    create: {
      id: 'seed-proj-1',
      name: '示範工程 A',
      description: '北區道路改善工程',
      code: 'DEMO-A',
      status: 'active',
      tenantId: tenant.id,
    },
  })
  console.log('Project:', proj1.name)

  const proj2 = await prisma.project.upsert({
    where: { id: 'seed-proj-2' },
    update: {},
    create: {
      id: 'seed-proj-2',
      name: '示範工程 B',
      description: '南區排水系統工程',
      code: 'DEMO-B',
      status: 'active',
      tenantId: tenant.id,
    },
  })
  console.log('Project:', proj2.name)

  await ensureProjectMember(proj1.id, admin.id, 'project_admin')
  await ensureProjectMember(proj1.id, member.id, 'member')
  await ensureProjectMember(proj2.id, admin.id, 'project_admin')
  console.log('Project members created')

  /** 每專案一筆 WBS 專案根（專案名稱層，供統計與階層包絡；不可刪改） */
  for (const p of [proj1, proj2]) {
    await prisma.wbsNode.upsert({
      where: { id: `wbs-root-${p.id}` },
      update: {},
      create: {
        id: `wbs-root-${p.id}`,
        projectId: p.id,
        parentId: null,
        code: '1',
        name: p.name,
        sortOrder: 0,
        isProjectRoot: true,
      },
    })
  }
  console.log('WBS project roots (示範工程 A/B)')

  console.log('Seed done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
