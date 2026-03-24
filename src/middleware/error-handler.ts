import type { Request, Response, NextFunction } from 'express'
import { Prisma } from '@prisma/client'
import { ZodError } from 'zod'
import { AppError } from '../shared/errors.js'

function isMulterError(err: unknown): err is { name: string; code: string; field?: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: string }).name === 'MulterError' &&
    typeof (err as { code?: string }).code === 'string'
  )
}

function formatZodForClient(err: ZodError): {
  message: string
  details: Array<{ path: string; message: string }>
} {
  const details = err.errors.map((issue) => ({
    path: issue.path.length ? issue.path.map(String).join('.') : '(root)',
    message: issue.message,
  }))
  const first = details[0]
  if (!first) {
    return { message: '送出的資料格式不符合要求。', details: [] }
  }
  const more = details.length > 1 ? `（另有 ${details.length - 1} 項錯誤，詳見 details）` : ''
  return {
    message: `資料驗證失敗：${first.path} — ${first.message}${more}`,
    details,
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    })
    return
  }

  if (err instanceof ZodError) {
    const { message, details } = formatZodForClient(err)
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message, details },
    })
    return
  }

  if (isMulterError(err)) {
    const code = err.code
    let message = err.message || '上傳處理失敗'
    let status = 400
    let clientCode = 'UPLOAD_ERROR'
    if (code === 'LIMIT_FILE_SIZE') {
      message =
        '檔案超過單檔上限（預設 50MB，亦可能受租戶單檔限制）。請縮小檔案後再試。'
      clientCode = 'FILE_TOO_LARGE'
    } else if (code === 'LIMIT_UNEXPECTED_FILE') {
      message =
        '上傳欄位不正確：請使用表單欄位名「file」傳檔案，並以「payload」傳送計畫資料的 JSON 字串。'
      clientCode = 'UPLOAD_FIELD_ERROR'
    } else if (code === 'LIMIT_FIELD_COUNT' || code === 'LIMIT_PART_COUNT') {
      message = '表單欄位過多，請勿修改上傳格式；僅需 file 與 payload。'
    }
    res.status(status).json({
      error: { code: clientCode, message },
    })
    return
  }

  /** express/body-parser：超過 express.json({ limit }) */
  if (
    typeof err === 'object' &&
    err !== null &&
    ((err as { type?: string }).type === 'entity.too.large' ||
      (err instanceof Error && /entity too large/i.test(err.message)))
  ) {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: '請求內容超過伺服器上限，請減少一次送出的資料量或聯繫管理員調整設定。',
      },
    })
    return
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message:
            '資料與現有紀錄衝突（例如同一專案計畫版本已存在）。請重新整理頁面後再試。',
        },
      })
      return
    }
    if (err.code === 'P2003') {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: '關聯資料不存在或已刪除，無法完成此操作。',
        },
      })
      return
    }
  }

  const statusCode = 500
  const code = 'INTERNAL_ERROR'
  // 正式環境只回傳通用訊息；開發環境回傳實際錯誤訊息方便除錯
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : 'Internal server error'

  // 開發／除錯時在伺服器 log 印出實際錯誤，方便排查（勿將 stack 回傳給前端）
  console.error('[500]', err)

  res.status(statusCode).json({
    error: { code, message },
  })
}
