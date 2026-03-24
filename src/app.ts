import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { errorHandler } from './middleware/error-handler.js'
import { apiRouter } from './routes/index.js'

const app = express()

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
)

// 正式環境未設定 CORS_ORIGIN 時不允許任何 cross-origin，強制在 .env 設定
const corsOrigin = process.env.CORS_ORIGIN?.trim()
const isProduction = process.env.NODE_ENV === 'production'
const origin =
  corsOrigin != null && corsOrigin !== ''
    ? corsOrigin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : isProduction
      ? false
      : '*'
app.use(
  cors({
    origin,
    credentials: true,
  })
)
/** 估驗計價等大量明細之 JSON；預設 10mb，可用環境變數覆寫（例：JSON_BODY_LIMIT=20mb） */
const jsonBodyLimit = process.env.JSON_BODY_LIMIT?.trim() || '10mb'
app.use(express.json({ limit: jsonBodyLimit }))

app.use('/api/v1', apiRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use(errorHandler)

export { app }
