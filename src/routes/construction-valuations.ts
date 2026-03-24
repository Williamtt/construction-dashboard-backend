import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { constructionValuationController } from '../modules/construction-valuation/index.js'

export const constructionValuationsRouter = Router({ mergeParams: true })

constructionValuationsRouter.get(
  '/pcces-lines',
  asyncHandler(constructionValuationController.pccesLinePicker.bind(constructionValuationController))
)

constructionValuationsRouter.get(
  '/summary',
  asyncHandler(constructionValuationController.listSummary.bind(constructionValuationController))
)

constructionValuationsRouter.get(
  '/',
  asyncHandler(constructionValuationController.list.bind(constructionValuationController))
)

constructionValuationsRouter.post(
  '/',
  asyncHandler(constructionValuationController.create.bind(constructionValuationController))
)

constructionValuationsRouter.get(
  '/:valuationId',
  asyncHandler(constructionValuationController.getById.bind(constructionValuationController))
)

constructionValuationsRouter.patch(
  '/:valuationId',
  asyncHandler(constructionValuationController.update.bind(constructionValuationController))
)

constructionValuationsRouter.delete(
  '/:valuationId',
  asyncHandler(constructionValuationController.delete.bind(constructionValuationController))
)
