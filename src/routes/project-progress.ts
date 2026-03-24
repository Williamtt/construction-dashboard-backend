import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { uploadSingleFile } from '../middleware/upload.js'
import { projectProgressController } from '../modules/project-progress/index.js'

export const projectProgressRouter = Router({ mergeParams: true })

projectProgressRouter.get(
  '/dashboard',
  asyncHandler(projectProgressController.dashboard.bind(projectProgressController))
)

projectProgressRouter.get(
  '/plan-uploads/excel-template',
  asyncHandler(projectProgressController.downloadPlanExcelTemplate.bind(projectProgressController))
)

projectProgressRouter.get(
  '/plan-uploads',
  asyncHandler(projectProgressController.listPlanUploads.bind(projectProgressController))
)

projectProgressRouter.get(
  '/plans',
  asyncHandler(projectProgressController.listPlans.bind(projectProgressController))
)

projectProgressRouter.post(
  '/plans/with-upload',
  uploadSingleFile,
  asyncHandler(projectProgressController.createPlanWithUpload.bind(projectProgressController))
)

projectProgressRouter.post(
  '/plans',
  asyncHandler(projectProgressController.createPlan.bind(projectProgressController))
)

projectProgressRouter.post(
  '/plans/duplicate',
  asyncHandler(projectProgressController.duplicatePlan.bind(projectProgressController))
)

projectProgressRouter.patch(
  '/plans/:planId/effective',
  asyncHandler(projectProgressController.patchPlanEffective.bind(projectProgressController))
)

projectProgressRouter.delete(
  '/plans/:planId',
  asyncHandler(projectProgressController.deletePlan.bind(projectProgressController))
)

projectProgressRouter.put(
  '/plans/:planId/entries',
  asyncHandler(projectProgressController.putPlanEntries.bind(projectProgressController))
)

projectProgressRouter.put(
  '/actuals',
  asyncHandler(projectProgressController.putActuals.bind(projectProgressController))
)
