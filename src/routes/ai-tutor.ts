import { Router } from 'express'
import { aiTutorController } from '../modules/ai-tutor/index.js'

export const aiTutorRouter = Router()

aiTutorRouter.post('/chat', aiTutorController.chat)
aiTutorRouter.get('/history', aiTutorController.history)
aiTutorRouter.post('/new', aiTutorController.newConversation)
