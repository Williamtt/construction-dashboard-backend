import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { PROGRESS_PLAN_EXCEL_TEMPLATE_FILE } from '../../lib/resource-paths.js'
import { fileService } from '../file/file.service.js'
import { FILE_CATEGORY_PROGRESS_PLAN_IMPORT } from '../../constants/file.js'
import { projectProgressService } from './project-progress.service.js'

function getProjectId(req: Request): string {
  const id = req.params.projectId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少專案 ID')
}

function getPlanId(req: Request): string {
  const id = req.params.planId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少計畫 ID')
}

export const projectProgressController = {
  async dashboard(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const primaryPlanId =
      typeof req.query.primaryPlanId === 'string' && req.query.primaryPlanId.length > 0
        ? req.query.primaryPlanId
        : undefined
    const comparePlanId =
      typeof req.query.comparePlanId === 'string' && req.query.comparePlanId.length > 0
        ? req.query.comparePlanId
        : undefined
    const data = await projectProgressService.getDashboard(
      projectId,
      req.user,
      primaryPlanId,
      comparePlanId
    )
    res.status(200).json({ data })
  },

  async listPlans(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const data = await projectProgressService.listPlans(projectId, req.user)
    res.status(200).json({ data })
  },

  async createPlan(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const data = await projectProgressService.createPlan(projectId, req.user, req.body)
    res.status(201).json({ data })
  },

  /** multipart：欄位 file + payload（JSON 字串，同 createPlan body） */
  async createPlanWithUpload(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const file = (req as Request & { file?: Express.Multer.File }).file
    if (!file?.buffer?.length) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        '伺服器未收到檔案內容。請重新選擇 Excel 後再試；若已選檔仍失敗，請重新整理頁面或改用 Chrome／Edge。'
      )
    }
    let body: unknown
    const rawPayload = (req.body as { payload?: string })?.payload
    if (typeof rawPayload === 'string') {
      try {
        body = JSON.parse(rawPayload) as unknown
      } catch {
        throw new AppError(400, 'VALIDATION_ERROR', 'payload 必須為有效 JSON')
      }
    } else {
      throw new AppError(400, 'VALIDATION_ERROR', '缺少 payload（JSON 字串）')
    }
    const data = await projectProgressService.createPlan(projectId, req.user, body)
    await fileService.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      projectId,
      req.user.id,
      req.user,
      { category: FILE_CATEGORY_PROGRESS_PLAN_IMPORT, businessId: data.id }
    )
    res.status(201).json({ data })
  },

  async listPlanUploads(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const data = await projectProgressService.listPlanUploads(projectId, req.user)
    res.status(200).json({ data })
  },

  /** GET：內建 `resources/templates/progress_template.xlsx` */
  async downloadPlanExcelTemplate(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const buf = await projectProgressService.getProgressPlanExcelTemplateBuffer(projectId, req.user)
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader('Content-Disposition', `attachment; filename="${PROGRESS_PLAN_EXCEL_TEMPLATE_FILE}"`)
    res.setHeader('Content-Length', String(buf.length))
    res.send(buf)
  },

  async duplicatePlan(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const data = await projectProgressService.duplicatePlan(projectId, req.user, req.body)
    res.status(201).json({ data })
  },

  async patchPlanEffective(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const planId = getPlanId(req)
    const data = await projectProgressService.patchPlanEffective(
      projectId,
      planId,
      req.user,
      req.body
    )
    res.status(200).json({ data })
  },

  async putPlanEntries(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const planId = getPlanId(req)
    const data = await projectProgressService.putPlanEntries(projectId, planId, req.user, req.body)
    res.status(200).json({ data })
  },

  async deletePlan(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const planId = getPlanId(req)
    const data = await projectProgressService.deletePlan(projectId, planId, req.user)
    res.status(200).json({ data })
  },

  async putActuals(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const data = await projectProgressService.putActuals(projectId, req.user, req.body)
    res.status(200).json({ data })
  },
}
