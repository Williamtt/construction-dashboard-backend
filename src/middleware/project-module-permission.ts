import type { Request, Response, NextFunction } from 'express'
import type { PermissionModuleId } from '../constants/permission-modules.js'
import {
  assertProjectModuleAction,
  type PermissionAction,
} from '../modules/project-permission/project-permission.service.js'

/**
 * 專案子路由用：檢查目前使用者對 `projectId` 是否具備指定模組動作。
 * 多數既有模組已在 **service** 內呼叫 `assertProjectModuleAction`；新增路由時可擇一：
 * - 維持僅在 service 檢查（並在路由檔頂部加 `@routeGuard` 註記，供 CI 掃描），或
 * - 在路由上掛本 middleware（與 service 並行時會多一次 DB 查詢，請避免重複時再移除其中一層）。
 */
export function requireProjectModuleAction(
  module: PermissionModuleId,
  action: PermissionAction,
  projectIdParam: 'projectId' = 'projectId'
) {
  return async function projectModulePermissionMiddleware(req: Request, res: Response, next: NextFunction) {
    const user = req.user
    if (!user) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '請先登入' } })
      return
    }
    const raw = req.params[projectIdParam]
    const projectId = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined
    if (!projectId) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: '缺少專案 id' } })
      return
    }
    try {
      await assertProjectModuleAction(user, projectId, module, action)
      next()
    } catch (e) {
      next(e)
    }
  }
}
