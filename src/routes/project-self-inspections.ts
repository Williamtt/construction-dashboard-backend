import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { projectSelfInspectionController } from '../modules/project-self-inspection/index.js'

export const projectSelfInspectionsRouter = Router({ mergeParams: true })

/** GET .../self-inspections/templates/import-catalog — 租戶 active 樣板 + imported 旗標（匯入 modal 列表） */
projectSelfInspectionsRouter.get(
  '/templates/import-catalog',
  asyncHandler(projectSelfInspectionController.listImportCatalog.bind(projectSelfInspectionController))
)

/** GET .../self-inspections/templates/available — 可匯入之樣板（租戶 active、尚未匯入本專案） */
projectSelfInspectionsRouter.get(
  '/templates/available',
  asyncHandler(
    projectSelfInspectionController.listAvailableTemplates.bind(projectSelfInspectionController)
  )
)

/** POST .../self-inspections/templates — 匯入樣板至專案；body：`{ templateId }` */
projectSelfInspectionsRouter.post(
  '/templates',
  asyncHandler(projectSelfInspectionController.importTemplate.bind(projectSelfInspectionController))
)

/** GET .../self-inspections/templates — 已匯入本專案之樣板 + 查驗次數 */
projectSelfInspectionsRouter.get(
  '/templates',
  asyncHandler(projectSelfInspectionController.listTemplates.bind(projectSelfInspectionController))
)

/** GET .../self-inspections/templates/:templateId/records — 紀錄列表（須在單一樣板 GET 前） */
projectSelfInspectionsRouter.get(
  '/templates/:templateId/records',
  asyncHandler(projectSelfInspectionController.listRecords.bind(projectSelfInspectionController))
)

/** POST .../self-inspections/templates/:templateId/records */
projectSelfInspectionsRouter.post(
  '/templates/:templateId/records',
  asyncHandler(projectSelfInspectionController.createRecord.bind(projectSelfInspectionController))
)

/** GET .../self-inspections/templates/:templateId/records/:recordId */
projectSelfInspectionsRouter.get(
  '/templates/:templateId/records/:recordId',
  asyncHandler(projectSelfInspectionController.getRecord.bind(projectSelfInspectionController))
)

/** DELETE .../self-inspections/templates/:templateId — 移除匯入（僅當本專案無查驗紀錄） */
projectSelfInspectionsRouter.delete(
  '/templates/:templateId',
  asyncHandler(
    projectSelfInspectionController.removeTemplateFromProject.bind(projectSelfInspectionController)
  )
)

/** GET .../self-inspections/templates/:templateId — 樣板結構 + recordCount */
projectSelfInspectionsRouter.get(
  '/templates/:templateId',
  asyncHandler(projectSelfInspectionController.getTemplate.bind(projectSelfInspectionController))
)
