/**
 * Storage abstraction: local disk or Cloudflare R2 (S3-compatible).
 * Set FILE_STORAGE_TYPE=local|r2; for r2 set R2_* env vars.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

export interface IStorage {
  upload(buffer: Buffer, key: string, contentType?: string): Promise<void>
  getStream(key: string): Promise<{ stream: Readable; contentType: string | null }>
  delete(key: string): Promise<void>
}

const localRoot = process.env.FILE_STORAGE_LOCAL_PATH ?? './storage'

function resolvePath(key: string): string {
  const safe = key.replace(/\.\./g, '').replace(/^\/+/, '')
  return path.join(localRoot, safe)
}

function contentTypePath(filePath: string): string {
  return `${filePath}.contenttype`
}

const localStorage: IStorage = {
  async upload(buffer: Buffer, key: string, contentType?: string): Promise<void> {
    const filePath = resolvePath(key)
    const dir = path.dirname(filePath)
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(filePath, buffer)
    if (contentType) {
      await fs.promises.writeFile(contentTypePath(filePath), contentType, 'utf8')
    }
  },

  async getStream(key: string): Promise<{ stream: Readable; contentType: string | null }> {
    const filePath = resolvePath(key)
    const ctPath = contentTypePath(filePath)
    let contentType: string | null = null
    try {
      contentType = await fs.promises.readFile(ctPath, 'utf8')
    } catch {
      // no .contenttype file
    }
    const stream = fs.createReadStream(filePath)
    return { stream, contentType }
  },

  async delete(key: string): Promise<void> {
    const filePath = resolvePath(key)
    await fs.promises.unlink(filePath).catch(() => {})
    await fs.promises.unlink(contentTypePath(filePath)).catch(() => {})
  },
}

function getR2Client(): { s3: S3Client; bucket: string } {
  const endpoint = process.env.R2_ENDPOINT
  const bucket = process.env.R2_BUCKET_NAME
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 storage requires R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY'
    )
  }
  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  })
  return { s3, bucket }
}

const r2Storage: IStorage = {
  async upload(buffer: Buffer, key: string, contentType?: string): Promise<void> {
    const { s3, bucket } = getR2Client()
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType ?? 'application/octet-stream',
      })
    )
  },

  async getStream(key: string): Promise<{ stream: Readable; contentType: string | null }> {
    const { s3, bucket } = getR2Client()
    const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    const body = out.Body
    if (!body || typeof body === 'string') {
      throw new Error('R2 getObject returned no body')
    }
    const stream = body as Readable
    const contentType = out.ContentType ?? null
    return { stream, contentType }
  },

  async delete(key: string): Promise<void> {
    const { s3, bucket } = getR2Client()
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  },
}

const type = process.env.FILE_STORAGE_TYPE ?? 'local'

export const storage: IStorage = type === 'r2' ? r2Storage : localStorage
