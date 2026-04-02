/**
 * @routeGuard projectPermissionsInService — 見 supervision-report.service assertProjectModuleAction
 */
import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { supervisionReportController } from '../modules/supervision-report/index.js'

export const supervisionReportsRouter = Router({ mergeParams: true })

supervisionReportsRouter.get(
  '/defaults',
  asyncHandler(supervisionReportController.defaults.bind(supervisionReportController))
)

supervisionReportsRouter.get(
  '/pcces-work-items',
  asyncHandler(
    supervisionReportController.pccesWorkItemPicker.bind(supervisionReportController)
  )
)

supervisionReportsRouter.get(
  '/',
  asyncHandler(supervisionReportController.list.bind(supervisionReportController))
)

supervisionReportsRouter.post(
  '/',
  asyncHandler(supervisionReportController.create.bind(supervisionReportController))
)

supervisionReportsRouter.get(
  '/:reportId',
  asyncHandler(supervisionReportController.getById.bind(supervisionReportController))
)

supervisionReportsRouter.get(
  '/:reportId/export-excel',
  asyncHandler(supervisionReportController.exportExcel.bind(supervisionReportController))
)

supervisionReportsRouter.patch(
  '/:reportId',
  asyncHandler(supervisionReportController.update.bind(supervisionReportController))
)

supervisionReportsRouter.delete(
  '/:reportId',
  asyncHandler(supervisionReportController.delete.bind(supervisionReportController))
)
