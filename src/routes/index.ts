import { Router } from 'express'
import { authMiddleware, requireAdmin, requirePlatformAdmin } from '../middleware/auth.js'
import { maintenanceMiddleware } from '../middleware/maintenance.js'
import { authRouter } from './auth.js'
import { announcementsRouter } from './announcements.js'
import { projectsRouter } from './projects.js'
import { usersRouter } from './users.js'
import { filesRouter } from './files.js'
import { formTemplatesRouter } from './form-templates.js'
import { adminRouter } from './admin.js'
import { platformAdminRouter } from './platform-admin.js'
import { alertsRouter } from './alerts.js'
import { appMetaRouter } from './app-meta.js'
import { notificationsRouter } from './notifications.js'

export const apiRouter = Router()

apiRouter.get('/', (_req, res) => {
  res.json({ data: { message: 'Construction Dashboard API v1' } })
})

apiRouter.use('/app', appMetaRouter)

apiRouter.use(maintenanceMiddleware)
apiRouter.use('/auth', authRouter)
apiRouter.use('/announcements', announcementsRouter)
apiRouter.use('/projects', authMiddleware, projectsRouter)
apiRouter.use('/users', authMiddleware, usersRouter)
apiRouter.use('/files', authMiddleware, filesRouter)
apiRouter.use('/form-templates', authMiddleware, formTemplatesRouter)
apiRouter.use('/admin', authMiddleware, requireAdmin, adminRouter)
apiRouter.use('/platform-admin', authMiddleware, requirePlatformAdmin, platformAdminRouter)
apiRouter.use('/alerts', authMiddleware, alertsRouter)
apiRouter.use('/notifications', authMiddleware, notificationsRouter)
