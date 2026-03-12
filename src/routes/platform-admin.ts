/**
 * 多租後台 API：租戶、專案總覽、使用者總覽（僅 platform_admin）
 */
import type { Prisma } from '@prisma/client'
import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcrypt'
import { prisma } from '../lib/db.js'
import { createTenantSchema, updateTenantSchema } from '../schemas/tenant.js'
import { resetPasswordSchema } from '../schemas/user.js'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { AppError } from '../shared/errors.js'

export const platformAdminRouter = Router()

function parseExpiresAt(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** GET /api/v1/platform-admin/tenants — 租戶列表 */
platformAdminRouter.get('/tenants', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const skip = (page - 1) * limit
    const statusFilter = req.query.status as string | undefined

    const where = statusFilter === 'active' || statusFilter === 'suspended' ? { status: statusFilter } : {}

    const [list, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: { _count: { select: { users: true, projects: true } } },
      }),
      prisma.tenant.count({ where }),
    ])

    res.status(200).json({ data: list, meta: { page, limit, total } })
  } catch (e) {
    console.error('GET /platform-admin/tenants', e)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '無法取得租戶列表' },
    })
  }
})

/** GET /api/v1/platform-admin/tenants/:id — 單一租戶 */
platformAdminRouter.get(
  '/tenants/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0]
    if (!id) {
      throw new AppError(400, 'BAD_REQUEST', '缺少租戶 id')
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id },
      include: { _count: { select: { users: true, projects: true } } },
    })
    if (!tenant) {
      throw new AppError(404, 'NOT_FOUND', '找不到該租戶')
    }
    res.status(200).json({ data: tenant })
  })
)

/** POST /api/v1/platform-admin/tenants — 新增租戶（僅 platform_admin） */
platformAdminRouter.post(
  '/tenants',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createTenantSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '欄位驗證失敗',
          details: parsed.error.flatten(),
        },
      })
      return
    }
    const { name, slug, status, expiresAt, userLimit, fileSizeLimitMb, storageQuotaMb } = parsed.data
    if (slug) {
      const existing = await prisma.tenant.findUnique({ where: { slug } })
      if (existing) {
        throw new AppError(409, 'CONFLICT', '此 slug 已被使用')
      }
    }
    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug: slug || undefined,
        status: status ?? 'active',
        expiresAt: parseExpiresAt(expiresAt ?? null),
        userLimit: userLimit ?? undefined,
        fileSizeLimitMb: fileSizeLimitMb ?? undefined,
        storageQuotaMb: storageQuotaMb ?? undefined,
      },
    })
    res.status(201).json({ data: tenant })
  })
)

/** PATCH /api/v1/platform-admin/tenants/:id — 更新租戶（編輯、停用、到期日、限制） */
platformAdminRouter.patch(
  '/tenants/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = typeof req.params.id === 'string' ? req.params.id : req.params.id?.[0]
    if (!id) {
      throw new AppError(400, 'BAD_REQUEST', '缺少租戶 id')
    }
    const parsed = updateTenantSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '欄位驗證失敗',
          details: parsed.error.flatten(),
        },
      })
      return
    }
    const existing = await prisma.tenant.findUnique({ where: { id } })
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', '找不到該租戶')
    }
    const { name, slug, status, expiresAt, userLimit, fileSizeLimitMb, storageQuotaMb } = parsed.data
    if (slug !== undefined && slug !== existing.slug) {
      const duplicate = await prisma.tenant.findUnique({ where: { slug: slug || undefined } })
      if (duplicate) {
        throw new AppError(409, 'CONFLICT', '此 slug 已被使用')
      }
    }
    const tenant = await prisma.tenant.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug: slug || null }),
        ...(status !== undefined && { status }),
        ...(expiresAt !== undefined && { expiresAt: parseExpiresAt(expiresAt) }),
        ...(userLimit !== undefined && { userLimit }),
        ...(fileSizeLimitMb !== undefined && { fileSizeLimitMb }),
        ...(storageQuotaMb !== undefined && { storageQuotaMb }),
      },
    })
    res.status(200).json({ data: tenant })
  })
)

/** GET /api/v1/platform-admin/projects — 全部專案（可依 tenantId 篩選，含所屬租戶名稱） */
platformAdminRouter.get('/projects', async (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string | undefined
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const skip = (page - 1) * limit

    const where = tenantId ? { tenantId } : {}

    const [list, total] = await Promise.all([
      prisma.project.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          code: true,
          status: true,
          tenantId: true,
          createdAt: true,
          updatedAt: true,
          tenant: { select: { name: true } },
        },
      }),
      prisma.project.count({ where }),
    ])

    const data = list.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      code: p.code,
      status: p.status,
      tenantId: p.tenantId,
      tenantName: p.tenant?.name ?? null,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }))

    res.status(200).json({ data, meta: { page, limit, total } })
  } catch (e) {
    console.error('GET /platform-admin/projects', e)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '無法取得專案列表' },
    })
  }
})

/** GET /api/v1/platform-admin/users — 全部使用者（可依 tenantId / systemRole / memberType 篩選） */
platformAdminRouter.get('/users', async (req: Request, res: Response) => {
  try {
    const tenantId = req.query.tenantId as string | undefined
    const systemRole = req.query.systemRole as string | undefined
    const memberType = req.query.memberType as string | undefined
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const skip = (page - 1) * limit

    const where: Prisma.UserWhereInput = {}
    if (tenantId) where.tenantId = tenantId
    if (systemRole === 'platform_admin' || systemRole === 'tenant_admin' || systemRole === 'project_user') where.systemRole = systemRole
    if (memberType === 'internal' || memberType === 'external') where.memberType = memberType

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          systemRole: true,
          memberType: true,
          tenantId: true,
          createdAt: true,
          updatedAt: true,
          tenant: { select: { name: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    const list = rows.map((u) => {
      const row = u as typeof u & { tenant?: { name: string } | null }
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        systemRole: row.systemRole,
        memberType: row.memberType,
        tenantId: row.tenantId,
        tenantName: row.tenant?.name ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }
    })

    res.status(200).json({ data: list, meta: { page, limit, total } })
  } catch (e) {
    console.error('GET /platform-admin/users', e)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '無法取得使用者列表' },
    })
  }
})

/** PATCH /api/v1/platform-admin/users/:id/password — 平台管理員重設使用者密碼 */
platformAdminRouter.patch(
  '/users/:id/password',
  asyncHandler(async (req: Request, res: Response) => {
    const rawId = req.params.id
    const userId = typeof rawId === 'string' ? rawId : Array.isArray(rawId) ? rawId[0] : undefined
    if (!userId) throw new AppError(400, 'BAD_REQUEST', '缺少使用者 ID')
    const parsed = resetPasswordSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? '欄位驗證失敗'
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new AppError(404, 'NOT_FOUND', '找不到該使用者')
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10)
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    })
    res.status(200).json({ data: { ok: true } })
  })
)
