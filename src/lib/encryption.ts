/**
 * 設備憑證等敏感欄位加密儲存（AES-256-GCM）。
 * 使用環境變數 ENCRYPTION_KEY（32 字元 hex = 16 bytes，或 44 字元 base64 = 32 bytes）。
 * 生產環境務必設定，未設定時不加密（僅開發方便，日誌會警告）。
 */
import crypto from 'node:crypto'

const ALG = 'aes-256-gcm'
const IV_LEN = 12
const TAG_LEN = 16
const KEY_LEN = 32

function getKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY?.trim()
  if (!raw) return null
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  try {
    const buf = Buffer.from(raw, 'base64')
    return buf.length === KEY_LEN ? buf : null
  } catch {
    return null
  }
}

export const encryption = {
  /**
   * 加密字串；若未設定 ENCRYPTION_KEY 則回傳 null（呼叫方應改存明文或略過）。
   */
  encrypt(plain: string): string | null {
    const key = getKey()
    if (!key || key.length !== KEY_LEN) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('ENCRYPTION_KEY must be set in production to store device credentials')
      }
      return null
    }
    const iv = crypto.randomBytes(IV_LEN)
    const cipher = crypto.createCipheriv(ALG, key, iv, { authTagLength: TAG_LEN })
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc]).toString('base64')
  },

  /**
   * 解密；若值為明文（未經加密）或 ENCRYPTION_KEY 未設定，回傳原值。
   */
  decrypt(encrypted: string): string {
    const key = getKey()
    if (!key || key.length !== KEY_LEN) return encrypted
    try {
      const buf = Buffer.from(encrypted, 'base64')
      if (buf.length < IV_LEN + TAG_LEN) return encrypted
      const iv = buf.subarray(0, IV_LEN)
      const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
      const data = buf.subarray(IV_LEN + TAG_LEN)
      const decipher = crypto.createDecipheriv(ALG, key, iv, { authTagLength: TAG_LEN })
      decipher.setAuthTag(tag)
      return decipher.update(data) + decipher.final('utf8')
    } catch {
      return encrypted
    }
  },
}
