import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import { UPLOAD_MAX_FILE_SIZE_DEFAULT_BYTES } from '../constants/file.js'

const storage = multer.memoryStorage()

/** 單檔上傳，欄位名 file，預設上限 50MB */
const uploadSingleFileMulter = multer({
  storage,
  limits: { fileSize: UPLOAD_MAX_FILE_SIZE_DEFAULT_BYTES },
}).single('file')

/**
 * 修正 UTF-8 檔名被誤解為 latin1 的亂碼（瀏覽器送 UTF-8，multer 依規格用 latin1 解析）
 */
function fixUtf8FileName(req: Request, _res: Response, next: NextFunction) {
  const file = (req as Request & { file?: Express.Multer.File }).file
  if (file?.originalname) {
    try {
      file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf8')
    } catch {
      // 轉換失敗則保留原樣
    }
  }
  next()
}

/** 單檔上傳 + 檔名編碼修正 */
export function uploadSingleFile(req: Request, res: Response, next: NextFunction) {
  uploadSingleFileMulter(req, res, () => fixUtf8FileName(req, res, next))
}
