import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { prisma } from '../lib/db.js'
import { storage } from '../lib/storage.js'
import { loginSchema, changePasswordSchema, refreshTokenSchema } from '../schemas/auth.js'
import { authMiddleware } from '../middleware/auth.js'
import { AppError } from '../shared/errors.js'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { loginLogRepository } from '../modules/login-log/login-log.repository.js'
import { isMaintenanceMode } from '../middleware/maintenance.js'
import { uploadSingleFile } from '../middleware/upload.js'

function getClientIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for']
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? null
  return req.ip ?? null
}
function getClientUserAgent(req: Request): string | null {
  const ua = req.headers['user-agent']
  return typeof ua === 'string' ? ua : null
}

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required')
}

/** Access JWT 效期；可單獨縮短（例 15m）以利行動端搭配 refresh。未設定時沿用 JWT_EXPIRES_IN。 */
const JWT_ACCESS_EXPIRES_IN =
  (process.env.JWT_ACCESS_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '7d') as string

const REFRESH_TOKEN_DAYS = Math.min(
  90,
  Math.max(1, parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS ?? '30', 10) || 30)
)

function hashRefreshToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function newRefreshTokenRaw(): string {
  return crypto.randomBytes(32).toString('hex')
}

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'TOO_MANY_REQUESTS', message: '登入嘗試次數過多，請於 15 分鐘後再試' },
    })
  },
})

export const authRouter = Router()

/** POST /api/v1/auth/login — 登入，回傳 accessToken 與 user */
authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
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

    const user = await prisma.user.findFirst({
      where: { email: parsed.data.email, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        avatarStorageKey: true,
        systemRole: true,
        tenantId: true,
        passwordHash: true,
        status: true,
      },
    })

    if (!user) {
      loginLogRepository
        .create({
          userId: null,
          email: parsed.data.email,
          success: false,
          ipAddress: getClientIp(req),
          userAgent: getClientUserAgent(req),
          failureReason: 'user_not_found',
        })
        .catch((e) => console.error('LoginLog create', e))
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Email 或密碼錯誤' },
      })
      return
    }

    const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
    if (!valid) {
      loginLogRepository
        .create({
          userId: user.id,
          email: parsed.data.email,
          success: false,
          ipAddress: getClientIp(req),
          userAgent: getClientUserAgent(req),
          failureReason: 'invalid_password',
        })
        .catch((e) => console.error('LoginLog create', e))
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Email 或密碼錯誤' },
      })
      return
    }

    // 帳號已停用者不得登入
    if (user.status === 'suspended') {
      loginLogRepository
        .create({
          userId: user.id,
          email: user.email,
          success: false,
          ipAddress: getClientIp(req),
          userAgent: getClientUserAgent(req),
          failureReason: 'account_suspended',
        })
        .catch((e) => console.error('LoginLog create', e))
      res.status(403).json({
        error: { code: 'ACCOUNT_SUSPENDED', message: '帳號已停用，無法登入。請聯絡管理員。' },
      })
      return
    }

    // 維護模式：僅平台管理員可登入，其餘回傳 503 系統維護中
    const maintenanceOn = await isMaintenanceMode()
    if (maintenanceOn && user.systemRole !== 'platform_admin') {
      loginLogRepository
        .create({
          userId: user.id,
          email: user.email,
          success: false,
          ipAddress: getClientIp(req),
          userAgent: getClientUserAgent(req),
          failureReason: 'maintenance_mode',
        })
        .catch((e) => console.error('LoginLog create', e))
      res.status(503).json({
        error: { code: 'MAINTENANCE', message: '系統維護中，請稍後再試。' },
      })
      return
    }

    loginLogRepository
      .create({
        userId: user.id,
        email: user.email,
        success: true,
        ipAddress: getClientIp(req),
        userAgent: getClientUserAgent(req),
        failureReason: null,
      })
      .catch((e) => console.error('LoginLog create', e))

    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        systemRole: user.systemRole,
        tenantId: user.tenantId,
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions
    )

    const refreshRaw = newRefreshTokenRaw()
    const refreshHash = hashRefreshToken(refreshRaw)
    const refreshExpires = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000)
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshHash,
        expiresAt: refreshExpires,
      },
    })

    res.status(200).json({
      data: {
        accessToken: token,
        refreshToken: refreshRaw,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          hasAvatar: !!user.avatarStorageKey,
          systemRole: user.systemRole,
          tenantId: user.tenantId,
        },
      },
    })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('POST /auth/login', err.message, err.stack)
    const payload: { error: { code: string; message: string; details?: string } } = {
      error: { code: 'INTERNAL_ERROR', message: '登入失敗' },
    }
    if (process.env.NODE_ENV !== 'production') {
      payload.error.details = err.message
    }
    res.status(500).json(payload)
  }
})

/** POST /api/v1/auth/refresh — 以 refreshToken 換發新 accessToken（並旋轉 refresh） */
authRouter.post('/refresh', async (req: Request, res: Response) => {
  try {
    const parsed = refreshTokenSchema.safeParse(req.body)
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

    const hash = hashRefreshToken(parsed.data.refreshToken)
    const row = await prisma.refreshToken.findFirst({
      where: { tokenHash: hash, expiresAt: { gt: new Date() } },
    })
    if (!row) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'refresh token 無效或已過期' },
      })
      return
    }

    const dbUser = await prisma.user.findFirst({
      where: { id: row.userId, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        systemRole: true,
        tenantId: true,
        status: true,
      },
    })
    if (!dbUser) {
      await prisma.refreshToken.deleteMany({ where: { userId: row.userId } })
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: '帳號不存在或已刪除' },
      })
      return
    }
    if (dbUser.status === 'suspended') {
      await prisma.refreshToken.deleteMany({ where: { userId: row.userId } })
      res.status(403).json({
        error: { code: 'ACCOUNT_SUSPENDED', message: '帳號已停用，無法使用' },
      })
      return
    }

    const maintenanceOn = await isMaintenanceMode()
    if (maintenanceOn && dbUser.systemRole !== 'platform_admin') {
      res.status(503).json({
        error: { code: 'MAINTENANCE', message: '系統維護中，請稍後再試。' },
      })
      return
    }

    await prisma.refreshToken.delete({ where: { id: row.id } })

    const accessToken = jwt.sign(
      {
        sub: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        systemRole: dbUser.systemRole,
        tenantId: dbUser.tenantId,
      },
      JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRES_IN } as jwt.SignOptions
    )

    const newRefreshRaw = newRefreshTokenRaw()
    const newHash = hashRefreshToken(newRefreshRaw)
    const refreshExpires = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000)
    await prisma.refreshToken.create({
      data: {
        userId: dbUser.id,
        tokenHash: newHash,
        expiresAt: refreshExpires,
      },
    })

    res.status(200).json({
      data: {
        accessToken,
        refreshToken: newRefreshRaw,
      },
    })
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    console.error('POST /auth/refresh', err.message, err.stack)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '更新登入狀態失敗' },
    })
  }
})

/** POST /api/v1/auth/logout — 撤銷該使用者所有 refresh token（access 仍須客戶端丟棄） */
authRouter.post(
  '/logout',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', '未登入')
    }
    await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } })
    res.status(200).json({ data: { ok: true } })
  })
)

/** GET /api/v1/auth/me — 回傳當前登入者（需 Authorization），含 hasAvatar */
authRouter.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', '未登入')
    }
    const user = await prisma.user.findFirst({
      where: { id: req.user.id, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        avatarStorageKey: true,
        systemRole: true,
        tenantId: true,
      },
    })
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', '未登入')
    }
    res.status(200).json({
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        hasAvatar: !!user.avatarStorageKey,
        systemRole: user.systemRole,
        tenantId: user.tenantId,
      },
    })
  })
)

/** GET /api/v1/auth/me/tenant-branding — 當前使用者所屬租戶的品牌（名稱、是否有 Logo），供 header 顯示，僅需登入 */
authRouter.get(
  '/me/tenant-branding',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', '未登入')
    }
    const tenantId = req.user.tenantId ?? null
    if (!tenantId) {
      res.status(200).json({ data: { name: null, hasLogo: false } })
      return
    }
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { name: true, logoStorageKey: true },
    })
    if (!tenant) {
      res.status(200).json({ data: { name: null, hasLogo: false } })
      return
    }
    res.status(200).json({
      data: {
        name: tenant.name,
        hasLogo: !!tenant.logoStorageKey,
      },
    })
  })
)

const AVATAR_MAX_BYTES = 2 * 1024 * 1024 // 2MB
const AVATAR_ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']

/** POST /api/v1/auth/me/avatar — 上傳個人頭貼（multipart: file） */
authRouter.post(
  '/me/avatar',
  authMiddleware,
  uploadSingleFile,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', '未登入')
    }
    const file = (req as Request & { file?: Express.Multer.File }).file
    if (!file?.buffer) {
      throw new AppError(400, 'BAD_REQUEST', '請選擇要上傳的圖片')
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new AppError(400, 'FILE_TOO_LARGE', `頭貼不得超過 ${AVATAR_MAX_BYTES / 1024 / 1024} MB`)
    }
    const mime = (file.mimetype || '').toLowerCase()
    if (!AVATAR_ALLOWED_MIMES.includes(mime)) {
      throw new AppError(400, 'VALIDATION_ERROR', '僅支援 PNG、JPG、WebP 圖片')
    }
    const existing = await prisma.user.findFirst({
      where: { id: req.user.id, deletedAt: null },
      select: { avatarStorageKey: true },
    })
    if (!existing) {
      throw new AppError(401, 'UNAUTHORIZED', '未登入')
    }
    const ext = mime.split('/')[1] ?? 'png'
    const storageKey = `users/${req.user.id}/avatar_${Date.now()}.${ext}`
    await storage.upload(file.buffer, storageKey, mime)
    if (existing.avatarStorageKey) {
      await storage.delete(existing.avatarStorageKey).catch(() => {})
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: { avatarStorageKey: storageKey },
    })
    res.status(200).json({ data: { hasAvatar: true } })
  })
)

/** GET /api/v1/auth/me/avatar — 當前使用者頭貼圖片（stream），僅需登入 */
authRouter.get(
  '/me/avatar',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', '未登入')
    }
    const user = await prisma.user.findFirst({
      where: { id: req.user.id, deletedAt: null },
      select: { avatarStorageKey: true },
    })
    if (!user?.avatarStorageKey) {
      throw new AppError(404, 'NOT_FOUND', '尚未設定頭貼')
    }
    const { stream, contentType } = await storage.getStream(user.avatarStorageKey)
    res.setHeader('Cache-Control', 'private, max-age=300')
    if (contentType) res.setHeader('Content-Type', contentType)
    stream.pipe(res)
  })
)

/** GET /api/v1/auth/me/tenant-logo — 當前使用者所屬租戶的 Logo 圖片（stream），僅需登入 */
authRouter.get(
  '/me/tenant-logo',
  authMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', '未登入')
    }
    const tenantId = req.user.tenantId ?? null
    if (!tenantId) {
      throw new AppError(404, 'NOT_FOUND', '無所屬租戶')
    }
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { logoStorageKey: true },
    })
    if (!tenant?.logoStorageKey) {
      throw new AppError(404, 'NOT_FOUND', '尚未設定公司 Logo')
    }
    const { stream, contentType } = await storage.getStream(tenant.logoStorageKey)
    res.setHeader('Cache-Control', 'private, max-age=300')
    if (contentType) res.setHeader('Content-Type', contentType)
    stream.pipe(res)
  })
)

/** PATCH /api/v1/auth/me/password — 變更目前使用者的密碼（需 Authorization） */
authRouter.patch('/me/password', authMiddleware, async (req: Request, res: Response) => {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: '未登入' },
    })
    return
  }
  try {
    const parsed = changePasswordSchema.safeParse(req.body)
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
    const user = await prisma.user.findFirst({
      where: { id: req.user.id, deletedAt: null },
    })
    if (!user) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: '未登入' },
      })
      return
    }
    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash)
    if (!valid) {
      res.status(400).json({
        error: { code: 'INVALID_PASSWORD', message: '目前密碼錯誤' },
      })
      return
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10)
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    })
    await prisma.refreshToken.deleteMany({ where: { userId: req.user.id } })
    res.status(200).json({ data: { ok: true } })
  } catch (e) {
    console.error('PATCH /auth/me/password', e)
    res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: '變更密碼失敗' },
    })
  }
})
