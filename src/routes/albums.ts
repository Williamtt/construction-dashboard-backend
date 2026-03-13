import { Router } from 'express'
import { asyncHandler } from '../shared/utils/async-handler.js'
import { albumController } from '../modules/album/index.js'

export const albumsRouter = Router({ mergeParams: true })

/** GET /api/v1/projects/:projectId/albums — 相簿列表 */
albumsRouter.get('/', asyncHandler(albumController.list.bind(albumController)))

/** POST /api/v1/projects/:projectId/albums — 新增相簿 */
albumsRouter.post('/', asyncHandler(albumController.create.bind(albumController)))

/** GET /api/v1/projects/:projectId/albums/:albumId/photos — 相簿內照片列表 */
albumsRouter.get('/:albumId/photos', asyncHandler(albumController.listPhotos.bind(albumController)))

/** POST /api/v1/projects/:projectId/albums/:albumId/photos — 加入照片至相簿 */
albumsRouter.post('/:albumId/photos', asyncHandler(albumController.addPhoto.bind(albumController)))

/** DELETE /api/v1/projects/:projectId/albums/:albumId/photos/:attachmentId — 從相簿移除照片 */
albumsRouter.delete(
  '/:albumId/photos/:attachmentId',
  asyncHandler(albumController.removePhoto.bind(albumController))
)

/** DELETE /api/v1/projects/:projectId/albums/:albumId — 刪除相簿 */
albumsRouter.delete('/:albumId', asyncHandler(albumController.delete.bind(albumController)))
