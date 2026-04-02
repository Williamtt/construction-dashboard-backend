import type { Request, Response } from 'express'
import { AppError } from '../../shared/errors.js'
import { parsePageLimit } from '../../shared/utils/pagination.js'
import { supervisionReportService } from './supervision-report.service.js'

function getProjectId(req: Request): string {
  const id = req.params.projectId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少專案 ID')
}

function getReportId(req: Request): string {
  const id = req.params.reportId
  if (typeof id === 'string') return id
  if (Array.isArray(id) && id[0]) return id[0]
  throw new AppError(400, 'BAD_REQUEST', '缺少報表 ID')
}

export const supervisionReportController = {
  async list(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const { page, limit } = parsePageLimit(req)
    const result = await supervisionReportService.list(projectId, req.user, page, limit)
    res.status(200).json({ data: result.data, meta: result.meta })
  },

  async defaults(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const data = await supervisionReportService.getFormDefaults(projectId, req.user)
    res.status(200).json({ data })
  },

  async pccesWorkItemPicker(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const reportDate = req.query.reportDate
    if (typeof reportDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) {
      throw new AppError(400, 'BAD_REQUEST', '請提供有效之 reportDate（YYYY-MM-DD）')
    }
    const excludeReportId =
      typeof req.query.excludeReportId === 'string' && req.query.excludeReportId.length > 0
        ? req.query.excludeReportId
        : undefined
    const data = await supervisionReportService.getPccesWorkItemPicker(
      projectId,
      req.user,
      reportDate,
      excludeReportId
    )
    res.status(200).json({ data })
  },

  async getById(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const reportId = getReportId(req)
    const data = await supervisionReportService.getById(projectId, reportId, req.user)
    res.status(200).json({ data })
  },

  async create(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const data = await supervisionReportService.create(projectId, req.user, req.body)
    res.status(201).json({ data })
  },

  async update(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const reportId = getReportId(req)
    const data = await supervisionReportService.update(projectId, reportId, req.user, req.body)
    res.status(200).json({ data })
  },

  async delete(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const reportId = getReportId(req)
    const data = await supervisionReportService.delete(projectId, reportId, req.user)
    res.status(200).json({ data })
  },

  async exportExcel(req: Request, res: Response) {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', '請先登入')
    const projectId = getProjectId(req)
    const reportId = getReportId(req)
    const buf = await supervisionReportService.exportExcel(projectId, reportId, req.user)
    const filename = `supervision-report-${reportId}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(buf)
  },
}
