import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { formTemplateService } from './form-template.service.js'

type ReqWithFile = Request & { file?: Express.Multer.File }

export const formTemplateController = {
  /** GET /admin/form-templates — 後台預設樣板列表 */
  async listDefault(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const tenantId = (req.query.tenantId as string) || req.user.tenantId
    if (!tenantId) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: '請提供 tenantId 或使用具租戶的帳號' } })
      return
    }
    const items = await formTemplateService.listDefaultByTenant(tenantId, req.user)
    res.status(200).json({
      data: items.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        fileName: row.fileName,
        fileSize: row.fileSize,
        mimeType: row.mimeType,
        uploaderName: (row as { uploaderName?: string | null }).uploaderName ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    })
  },

  /** POST /admin/form-templates — 後台新增預設樣板 */
  async createDefault(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const file = (req as ReqWithFile).file
    if (!file?.buffer) throw new AppError(400, 'BAD_REQUEST', '請上傳檔案')
    const name = (req.body.name as string)?.trim() || file.originalname || '未命名'
    const description = (req.body.description as string)?.trim() || null
    const tenantId = (req.body.tenantId as string) || req.user.tenantId
    if (!tenantId) throw new AppError(400, 'BAD_REQUEST', '請提供 tenantId')
    const template = await formTemplateService.createDefault(
      file.buffer,
      file.originalname || 'file',
      file.mimetype || 'application/octet-stream',
      name,
      description,
      req.user.id,
      req.user,
      tenantId
    )
    res.status(201).json({
      data: {
        id: template.id,
        name: template.name,
        description: template.description,
        fileName: template.fileName,
        fileSize: template.fileSize,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    })
  },

  /** GET /projects/:projectId/form-templates — 專案可見樣板（預設+專案） */
  async listForProject(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const items = await formTemplateService.listForProject(projectId, req.user.id, req.user)
    res.status(200).json({
      data: items.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        fileName: row.fileName,
        fileSize: row.fileSize,
        mimeType: row.mimeType,
        projectId: row.projectId,
        isDefault: row.projectId === null,
        uploaderName: (row as { uploaderName?: string | null }).uploaderName ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    })
  },

  /** POST /projects/:projectId/form-templates — 專案新增樣板 */
  async createForProject(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = req.params.projectId as string
    const file = (req as ReqWithFile).file
    if (!file?.buffer) throw new AppError(400, 'BAD_REQUEST', '請上傳檔案')
    const name = (req.body.name as string)?.trim() || file.originalname || '未命名'
    const description = (req.body.description as string)?.trim() || null
    const template = await formTemplateService.createForProject(
      file.buffer,
      file.originalname || 'file',
      file.mimetype || 'application/octet-stream',
      name,
      description,
      projectId,
      req.user.id,
      req.user
    )
    res.status(201).json({
      data: {
        id: template.id,
        name: template.name,
        description: template.description,
        fileName: template.fileName,
        fileSize: template.fileSize,
        createdAt: template.createdAt.toISOString(),
        updatedAt: template.updatedAt.toISOString(),
      },
    })
  },

  /** GET /form-templates/:id — 取得／下載（stream） */
  async getById(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const id = req.params.id as string
    const download = req.query.download === 'true' || req.query.download === '1'
    const result = await formTemplateService.getById(id, req.user.id, req.user)
    const { stream, contentType, fileName } = result
    if (!stream) throw new AppError(500, 'INTERNAL_ERROR', '無法讀取檔案')
    res.setHeader('Content-Type', contentType ?? result.mimeType)
    if (download) {
      const safe = (fileName || 'download').replace(/[^\x20-\x7E]/g, '_').trim() || 'download'
      res.setHeader('Content-Disposition', `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(fileName || 'download')}`)
    }
    stream.pipe(res)
  },

  /** PATCH /form-templates/:id — 更新名稱、描述 */
  async update(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const id = req.params.id as string
    const name = (req.body.name as string)?.trim()
    const description = req.body.description !== undefined ? (req.body.description as string)?.trim() || null : undefined
    const updated = await formTemplateService.update(id, { name, description }, req.user)
    res.status(200).json({
      data: {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        updatedAt: updated.updatedAt.toISOString(),
      },
    })
  },

  /** DELETE /form-templates/:id */
  async delete(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const id = req.params.id as string
    await formTemplateService.delete(id, req.user.id, req.user)
    res.status(204).send()
  },
}
