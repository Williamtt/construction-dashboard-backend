import { Router, type Request, type Response } from 'express'

/**
 * GET /api/v1/app/version — 公開，供原生 App 強制更新檢查。
 * 環境變數：IOS_MIN_APP_VERSION、IOS_LATEST_APP_VERSION、IOS_APP_STORE_URL
 */
export const appMetaRouter = Router()

appMetaRouter.get('/version', (_req: Request, res: Response) => {
  const minimumVersion = process.env.IOS_MIN_APP_VERSION ?? '1.0.0'
  const latestVersion = process.env.IOS_LATEST_APP_VERSION ?? minimumVersion
  const appStoreURL =
    process.env.IOS_APP_STORE_URL ?? 'https://apps.apple.com/app/id0000000000'

  res.json({
    data: {
      minimumVersion,
      latestVersion,
      appStoreURL,
    },
  })
})
