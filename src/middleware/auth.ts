import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../lib/db.js'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required')
}

/** 從 Authorization: Bearer <token> 解析並驗證 JWT，載入 DB 使用者（未刪除、未停用、租戶有效）後寫入 req.user */
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: '未提供或無效的 token' },
    })
    return
  }

  let payload: {
    sub: string
    email: string
    name?: string
    systemRole: string
    tenantId?: string | null
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET as jwt.Secret, {
      algorithms: ['HS256'],
    })
    payload = decoded as typeof payload
  } catch {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'token 無效或已過期' },
    })
    return
  }

  prisma.user
    .findFirst({
      where: { id: payload.sub, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        systemRole: true,
        tenantId: true,
        status: true,
        tenant: {
          select: { deletedAt: true, status: true },
        },
      },
    })
    .then((dbUser) => {
      if (!dbUser) {
        res.status(401).json({
          error: { code: 'UNAUTHORIZED', message: '帳號不存在或已刪除' },
        })
        return
      }
      if (dbUser.status === 'suspended') {
        res.status(403).json({
          error: { code: 'ACCOUNT_SUSPENDED', message: '帳號已停用，無法使用' },
        })
        return
      }
      if (dbUser.systemRole !== 'platform_admin' && dbUser.tenantId) {
        const t = dbUser.tenant
        if (!t || t.deletedAt != null) {
          res.status(403).json({
            error: { code: 'FORBIDDEN', message: '所屬租戶已刪除或不存在' },
          })
          return
        }
        if (t.status === 'suspended') {
          res.status(403).json({
            error: { code: 'FORBIDDEN', message: '所屬租戶已停用' },
          })
          return
        }
      }
      req.user = {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name ?? null,
        systemRole: dbUser.systemRole as 'platform_admin' | 'tenant_admin' | 'project_user',
        tenantId: dbUser.tenantId ?? null,
      }
      next()
    })
    .catch(next)
}

/** 僅 platform_admin 可通過；須在 authMiddleware 之後使用 */
export function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: '請先登入' },
    })
    return
  }
  if (req.user.systemRole !== 'platform_admin') {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: '僅平台管理員可存取' },
    })
    return
  }
  next()
}

/** 租戶管理員或平台管理員可通過（可進單租後台）；須在 authMiddleware 之後使用 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.user) {
    res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: '請先登入' },
    })
    return
  }
  const allowed = req.user.systemRole === 'platform_admin' || req.user.systemRole === 'tenant_admin'
  if (!allowed) {
    res.status(403).json({
      error: { code: 'FORBIDDEN', message: '僅管理員可存取後台' },
    })
    return
  }
  next()
}
