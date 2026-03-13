import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { formTemplateController } from '../modules/form-template/index.js'

/** GET /api/v1/form-templates/:id — 下載；PATCH/DELETE — 更新／刪除（依樣板所屬驗證權限） */
export const formTemplatesRouter = Router()

formTemplatesRouter.get('/:id', asyncHandler(formTemplateController.getById.bind(formTemplateController)))
formTemplatesRouter.patch('/:id', asyncHandler(formTemplateController.update.bind(formTemplateController)))
formTemplatesRouter.delete('/:id', asyncHandler(formTemplateController.delete.bind(formTemplateController)))
