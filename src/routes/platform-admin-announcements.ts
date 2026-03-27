/**
 * 平台公告 API：CRUD（僅 platform_admin）
 */
import { Prisma } from '@prisma/client'
import { Router, type Request, type Response } from 'express'
import { prisma } from '../lib/db.js'
import { createAnnouncementSchema, updateAnnouncementSchema } from '../schemas/announcement.js'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { AppError } from '../shared/errors.js'
import { notDeleted, softDeleteSet } from '../shared/soft-delete.js'
import { recordAudit, recordAuditMutation } from '../modules/audit-log/audit-log.service.js'

export const platformAdminAnnouncementsRouter = Router()

function parseDate(s: string | null | undefined): Date | null {
  if (s == null || s === '') return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function targetTenantIdsToJson(ids: string[] | null | undefined): Prisma.InputJsonValue | undefined {
  if (ids === undefined) return undefined
  if (ids === null) return Prisma.DbNull as unknown as Prisma.InputJsonValue
  return ids
}

/** GET /platform-admin/announcements — 列表，分頁 */
platformAdminAnnouncementsRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const page = Math.max(1, Number(req.query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20))
    const skip = (page - 1) * limit
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    const where = {
      ...notDeleted,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' as const } },
              { body: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }
    const [list, total] = await Promise.all([
      prisma.platformAnnouncement.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.platformAnnouncement.count({ where }),
    ])
    res.status(200).json({ data: list, meta: { page, limit, total } })
  })
)

function paramId(req: Request): string {
  const p = req.params.id
  return Array.isArray(p) ? p[0] ?? '' : p ?? ''
}

/** GET /platform-admin/announcements/:id */
platformAdminAnnouncementsRouter.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = paramId(req)
    const row = await prisma.platformAnnouncement.findFirst({ where: { id, ...notDeleted } })
    if (!row) throw new AppError(404, 'NOT_FOUND', '找不到該公告')
    res.status(200).json({ data: row })
  })
)

/** POST /platform-admin/announcements */
platformAdminAnnouncementsRouter.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = createAnnouncementSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '欄位驗證失敗', details: parsed.error.flatten() },
      })
      return
    }
    const { title, body, publishedAt, expiresAt, targetTenantIds } = parsed.data
    const row = await prisma.platformAnnouncement.create({
      data: {
        title,
        body: body ?? '',
        publishedAt: parseDate(publishedAt ?? null),
        expiresAt: parseDate(expiresAt ?? null),
        targetTenantIds: targetTenantIdsToJson(targetTenantIds),
      },
    })
    await recordAudit(req, {
      action: 'platform_announcement.create',
      resourceType: 'platform_announcement',
      resourceId: row.id,
      tenantId: null,
    })
    res.status(201).json({ data: row })
  })
)

/** PATCH /platform-admin/announcements/:id */
platformAdminAnnouncementsRouter.patch(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = paramId(req)
    const existing = await prisma.platformAnnouncement.findFirst({ where: { id, ...notDeleted } })
    if (!existing) throw new AppError(404, 'NOT_FOUND', '找不到該公告')
    const parsed = updateAnnouncementSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: '欄位驗證失敗', details: parsed.error.flatten() },
      })
      return
    }
    const { title, body, publishedAt, expiresAt, targetTenantIds } = parsed.data
    const data: { title?: string; body?: string; publishedAt?: Date | null; expiresAt?: Date | null; targetTenantIds?: Prisma.InputJsonValue } = {}
    if (title !== undefined) data.title = title
    if (body !== undefined) data.body = body
    if (publishedAt !== undefined) data.publishedAt = parseDate(publishedAt)
    if (expiresAt !== undefined) data.expiresAt = parseDate(expiresAt)
    if (targetTenantIds !== undefined) data.targetTenantIds = targetTenantIdsToJson(targetTenantIds)
    const n = await prisma.platformAnnouncement.updateMany({
      where: { id, ...notDeleted },
      data,
    })
    if (n.count === 0) throw new AppError(404, 'NOT_FOUND', '找不到該公告')
    const row = await prisma.platformAnnouncement.findFirst({ where: { id, ...notDeleted } })
    if (!row) throw new AppError(404, 'NOT_FOUND', '找不到該公告')
    await recordAuditMutation(req, {
      action: 'platform_announcement.update',
      resourceType: 'platform_announcement',
      resourceId: id,
      tenantId: null,
      before: existing,
      after: row,
    })
    res.status(200).json({ data: row })
  })
)

/** DELETE /platform-admin/announcements/:id */
platformAdminAnnouncementsRouter.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const id = paramId(req)
    const uid = req.user?.id
    if (!uid) throw new AppError(401, 'UNAUTHORIZED', '未授權')
    const rowBefore = await prisma.platformAnnouncement.findFirst({ where: { id, ...notDeleted } })
    if (!rowBefore) throw new AppError(404, 'NOT_FOUND', '找不到該公告')
    const n = await prisma.platformAnnouncement.updateMany({
      where: { id, ...notDeleted },
      data: softDeleteSet(uid),
    })
    if (n.count === 0) throw new AppError(404, 'NOT_FOUND', '找不到該公告')
    await recordAuditMutation(req, {
      action: 'platform_announcement.soft_delete',
      resourceType: 'platform_announcement',
      resourceId: id,
      tenantId: null,
      before: rowBefore,
    })
    res.status(200).json({ data: { ok: true } })
  })
)
