import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { cameraService } from './camera.service.js'
import { createCameraSchema, updateCameraSchema, connectionStatusOverrideSchema } from '../../schemas/camera.js'

export const cameraController = {
  async list(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const items = await cameraService.list(projectId, req.user.id, req.user)
    res.json({
      data: items.map((c) => ({
        id: c.id,
        projectId: c.projectId,
        name: c.name,
        streamToken: c.streamToken,
        connectionMode: c.connectionMode,
        status: c.status,
        connectionStatus: c.connectionStatus,
        lastStreamAt: c.lastStreamAt?.toISOString() ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        ...(c.connectionStatusOverride != null && { connectionStatusOverride: c.connectionStatusOverride }),
        ...(c.actualConnectionStatus != null && { actualConnectionStatus: c.actualConnectionStatus }),
      })),
    })
  },

  async create(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const parsed = createCameraSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ')
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    const camera = await cameraService.create(projectId, parsed.data, req.user.id, req.user)
    res.status(201).json({
      data: {
        id: camera.id,
        projectId: camera.projectId,
        name: camera.name,
        streamToken: camera.streamToken,
        connectionMode: camera.connectionMode,
        status: camera.status,
        connectionStatus: 'not_configured' as const,
        lastStreamAt: null,
        createdAt: camera.createdAt.toISOString(),
        updatedAt: camera.updatedAt.toISOString(),
      },
    })
  },

  async getById(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const cameraId = req.params.cameraId as string
    const camera = await cameraService.getById(cameraId, projectId, req.user.id, req.user)
    res.json({
      data: {
        id: camera.id,
        projectId: camera.projectId,
        name: camera.name,
        streamToken: camera.streamToken,
        connectionMode: camera.connectionMode,
        status: camera.status,
        connectionStatus: camera.connectionStatus,
        lastStreamAt: camera.lastStreamAt?.toISOString() ?? null,
        createdAt: camera.createdAt.toISOString(),
        updatedAt: camera.updatedAt.toISOString(),
        ...(camera.sourceHost != null && { sourceHost: camera.sourceHost }),
        ...(camera.sourcePort != null && { sourcePort: camera.sourcePort }),
        ...(camera.sourcePath != null && { sourcePath: camera.sourcePath }),
        ...(camera.hasCredentials != null && { hasCredentials: camera.hasCredentials }),
        ...(camera.usernameMasked != null && { usernameMasked: camera.usernameMasked }),
        ...(camera.connectionStatusOverride != null && { connectionStatusOverride: camera.connectionStatusOverride }),
        ...(camera.actualConnectionStatus != null && { actualConnectionStatus: camera.actualConnectionStatus }),
      },
    })
  },

  async getByIdForInstall(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const cameraId = req.params.cameraId as string
    const camera = await cameraService.getByIdWithSourceUrlDecrypted(cameraId, projectId, req.user.id, req.user)
    res.json({
      data: {
        id: camera.id,
        projectId: camera.projectId,
        name: camera.name,
        streamToken: camera.streamToken,
        connectionMode: camera.connectionMode,
        status: camera.status,
        sourceUrlMasked: camera.sourceUrlMasked,
        createdAt: camera.createdAt.toISOString(),
        updatedAt: camera.updatedAt.toISOString(),
      },
    })
  },

  async update(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const cameraId = req.params.cameraId as string
    const parsed = updateCameraSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ')
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    await cameraService.update(cameraId, projectId, parsed.data, req.user.id, req.user)
    const camera = await cameraService.getById(cameraId, projectId, req.user.id, req.user)
    res.json({
      data: {
        id: camera.id,
        projectId: camera.projectId,
        name: camera.name,
        streamToken: camera.streamToken,
        connectionMode: camera.connectionMode,
        status: camera.status,
        connectionStatus: camera.connectionStatus,
        lastStreamAt: camera.lastStreamAt?.toISOString() ?? null,
        createdAt: camera.createdAt.toISOString(),
        updatedAt: camera.updatedAt.toISOString(),
      },
    })
  },

  async delete(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const cameraId = req.params.cameraId as string
    await cameraService.delete(cameraId, projectId, req.user.id, req.user)
    res.status(204).send()
  },

  /** 手動標示為離線或清除標示；body: { override: 'offline' | null } */
  async setConnectionStatusOverride(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const cameraId = req.params.cameraId as string
    const parsed = connectionStatusOverrideSchema.safeParse(req.body)
    if (!parsed.success) {
      const msg = parsed.error.errors.map((e) => e.message).join(', ')
      throw new AppError(400, 'VALIDATION_ERROR', msg)
    }
    await cameraService.setConnectionStatusOverride(
      cameraId,
      projectId,
      parsed.data.override,
      req.user.id,
      req.user
    )
    const camera = await cameraService.getById(cameraId, projectId, req.user.id, req.user)
    res.json({
      data: {
        id: camera.id,
        connectionStatus: camera.connectionStatus,
        connectionStatusOverride: camera.connectionStatusOverride ?? null,
        actualConnectionStatus: camera.actualConnectionStatus ?? null,
      },
    })
  },

  async getPlayUrl(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const cameraId = req.params.cameraId as string
    const result = await cameraService.getPlayUrl(cameraId, projectId, req.user.id, req.user)
    res.json({ data: result })
  },

  async getInstallConfig(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const cameraId = req.params.cameraId as string
    const result = await cameraService.getInstallConfig(cameraId, projectId, req.user.id, req.user)
    res.json({ data: result })
  },

  async downloadInstallYaml(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const cameraId = req.params.cameraId as string
    const content = await cameraService.getInstallYamlContent(cameraId, projectId, req.user.id, req.user)
    const filename = `go2rtc-${cameraId.slice(0, 8)}.yaml`
    res.setHeader('Content-Type', 'application/x-yaml; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(content)
  },

  /** 專案層級一鍵安裝包（zip：本專案所有攝影機的 go2rtc.yaml + run 腳本；Mac 含 run.command 可雙擊） */
  async downloadProjectInstallPackage(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const os = (req.query.os as string)?.toLowerCase()
    if (os !== 'win' && os !== 'mac') {
      throw new AppError(400, 'VALIDATION_ERROR', '請指定 os=win（Windows）或 os=mac（Mac）')
    }
    const buffer = await cameraService.getInstallPackageForProject(projectId, req.user.id, req.user, os)
    const filename = os === 'win' ? 'go2rtc-setup-windows.zip' : 'go2rtc-setup-mac.zip'
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', String(buffer.length))
    res.send(buffer)
  },

  /** 一鍵安裝包（zip：單一攝影機用；query os=win|mac） */
  async downloadInstallPackage(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const cameraId = req.params.cameraId as string
    const os = (req.query.os as string)?.toLowerCase()
    if (os !== 'win' && os !== 'mac') {
      throw new AppError(400, 'VALIDATION_ERROR', '請指定 os=win（Windows）或 os=mac（Mac）')
    }
    const buffer = await cameraService.getInstallPackage(cameraId, projectId, req.user.id, req.user, os)
    const filename = os === 'win' ? 'go2rtc-setup-windows.zip' : 'go2rtc-setup-mac.zip'
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', String(buffer.length))
    res.send(buffer)
  },
}
