import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- mocks（必須在 import service 之前宣告，vitest 自動提升至頂端） ---

vi.mock('../../lib/db.js', () => ({
  prisma: {
    tenant: {
      findFirst: vi.fn(),
    },
  },
}))

vi.mock('../project/project.repository.js', () => ({
  projectRepository: {
    findById: vi.fn(),
  },
}))

vi.mock('./file.repository.js', () => ({
  fileRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findByProjectAndHash: vi.fn(),
    countByStorageKey: vi.fn(),
    softDelete: vi.fn(),
    getTenantStorageUsageBytesSimple: vi.fn(),
  },
}))

vi.mock('../../lib/storage.js', () => ({
  storage: {
    upload: vi.fn(),
    delete: vi.fn(),
    getStream: vi.fn(),
  },
}))

vi.mock('../../shared/project-access.js', () => ({
  assertCanAccessProject: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../project-permission/project-permission.service.js', () => ({
  assertProjectModuleAction: vi.fn().mockResolvedValue(undefined),
}))

// --- 引入受測模組（mock 已就位）---

import { fileService } from './file.service.js'
import { fileRepository } from './file.repository.js'
import { storage } from '../../lib/storage.js'
import { projectRepository } from '../project/project.repository.js'
import { prisma } from '../../lib/db.js'
import { AppError } from '../../shared/errors.js'
import { UPLOAD_MAX_FILE_SIZE_DEFAULT_BYTES } from '../../constants/file.js'

// --- 測試輔助 ---

const mockUser = {
  id: 'user-1',
  systemRole: 'tenant_admin' as const,
  tenantId: 'tenant-1',
}

const mockProject = {
  id: 'project-1',
  tenantId: 'tenant-1',
}

const mockTenant = (overrides: { fileSizeLimitMb?: number | null; storageQuotaMb?: number | null } = {}) => ({
  id: 'tenant-1',
  fileSizeLimitMb: overrides.fileSizeLimitMb !== undefined ? overrides.fileSizeLimitMb : null,
  storageQuotaMb: overrides.storageQuotaMb !== undefined ? overrides.storageQuotaMb : null,
})

const mockAttachment = (storageKey = 'tenant-1/project-1/abc_file.pdf') => ({
  id: 'att-1',
  projectId: 'project-1',
  tenantId: 'tenant-1',
  storageKey,
  fileName: 'file.pdf',
  fileSize: 1024,
  mimeType: 'application/pdf',
  fileHash: 'aabbcc',
  category: null,
  businessId: null,
  uploadedById: 'user-1',
  createdAt: new Date(),
})

const smallBuffer = Buffer.alloc(1024) // 1 KB

beforeEach(() => {
  vi.clearAllMocks()
  // 預設：project 存在、tenant 無特別限制
  vi.mocked(projectRepository.findById).mockResolvedValue(mockProject as never)
  vi.mocked(prisma.tenant.findFirst).mockResolvedValue(mockTenant() as never)
  vi.mocked(fileRepository.findByProjectAndHash).mockResolvedValue(null)
  vi.mocked(fileRepository.create).mockResolvedValue(mockAttachment() as never)
  vi.mocked(storage.upload).mockResolvedValue(undefined)
})

// ─────────────────────────────────────────────────────────────
// 1. 單檔大小超額
// ─────────────────────────────────────────────────────────────
describe('uploadFile — 單檔大小超額', () => {
  it('超過租戶自訂上限時拋出 AppError 403 FILE_SIZE_EXCEEDED', async () => {
    const limitMb = 1 // 1 MB
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(mockTenant({ fileSizeLimitMb: limitMb }) as never)

    const oversized = Buffer.alloc(limitMb * 1024 * 1024 + 1)
    const err = await fileService
      .uploadFile(oversized, 'big.bin', 'application/octet-stream', 'project-1', 'user-1', mockUser)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).statusCode).toBe(403)
    expect((err as AppError).code).toBe('FILE_SIZE_EXCEEDED')
  })

  it('超過系統預設上限（50 MB）時拋出 FILE_SIZE_EXCEEDED', async () => {
    const oversized = Buffer.alloc(UPLOAD_MAX_FILE_SIZE_DEFAULT_BYTES + 1)
    const err = await fileService
      .uploadFile(oversized, 'huge.bin', 'application/octet-stream', 'project-1', 'user-1', mockUser)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).statusCode).toBe(403)
    expect((err as AppError).code).toBe('FILE_SIZE_EXCEEDED')
  })
})

// ─────────────────────────────────────────────────────────────
// 2. 租戶總量配額超額
// ─────────────────────────────────────────────────────────────
describe('uploadFile — 租戶總量配額超額', () => {
  it('已用量 + 新檔超過配額時拋出 AppError 403 STORAGE_QUOTA_EXCEEDED', async () => {
    const quotaMb = 10
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(
      mockTenant({ storageQuotaMb: quotaMb }) as never
    )
    // 模擬已用量接近上限
    vi.mocked(fileRepository.getTenantStorageUsageBytesSimple).mockResolvedValue(
      quotaMb * 1024 * 1024 - 100
    )

    const err = await fileService
      .uploadFile(smallBuffer, 'file.pdf', 'application/pdf', 'project-1', 'user-1', mockUser)
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AppError)
    expect((err as AppError).statusCode).toBe(403)
    expect((err as AppError).code).toBe('STORAGE_QUOTA_EXCEEDED')
    expect(vi.mocked(storage.upload)).not.toHaveBeenCalled()
  })

  it('未達配額時正常上傳', async () => {
    const quotaMb = 10
    vi.mocked(prisma.tenant.findFirst).mockResolvedValue(
      mockTenant({ storageQuotaMb: quotaMb }) as never
    )
    vi.mocked(fileRepository.getTenantStorageUsageBytesSimple).mockResolvedValue(0)

    await fileService.uploadFile(smallBuffer, 'file.pdf', 'application/pdf', 'project-1', 'user-1', mockUser)
    expect(vi.mocked(storage.upload)).toHaveBeenCalledOnce()
  })
})

// ─────────────────────────────────────────────────────────────
// 3. Hash 去重：相同內容不重寫 storage
// ─────────────────────────────────────────────────────────────
describe('uploadFile — hash 去重', () => {
  it('相同 hash 已存在時不呼叫 storage.upload，但仍建立新 attachment 記錄', async () => {
    const existing = mockAttachment('existing/key')
    vi.mocked(fileRepository.findByProjectAndHash).mockResolvedValue(existing as never)

    await fileService.uploadFile(smallBuffer, 'dup.pdf', 'application/pdf', 'project-1', 'user-1', mockUser)

    expect(vi.mocked(storage.upload)).not.toHaveBeenCalled()
    expect(vi.mocked(fileRepository.create)).toHaveBeenCalledOnce()
    // 建立的記錄應重用既有 storageKey
    expect(vi.mocked(fileRepository.create).mock.calls[0]?.[0]).toMatchObject({
      storageKey: 'existing/key',
    })
  })

  it('不同 hash（全新檔案）會呼叫 storage.upload', async () => {
    vi.mocked(fileRepository.findByProjectAndHash).mockResolvedValue(null)

    await fileService.uploadFile(smallBuffer, 'new.pdf', 'application/pdf', 'project-1', 'user-1', mockUser)

    expect(vi.mocked(storage.upload)).toHaveBeenCalledOnce()
  })
})

// ─────────────────────────────────────────────────────────────
// 4. 刪除最後引用時清除 storage 實體
// ─────────────────────────────────────────────────────────────
describe('delete — refCount 控制', () => {
  beforeEach(() => {
    vi.mocked(fileRepository.findById).mockResolvedValue(mockAttachment() as never)
    vi.mocked(fileRepository.softDelete).mockResolvedValue({
      storageKey: mockAttachment().storageKey,
      fileSize: 1024,
      tenantId: 'tenant-1',
    } as never)
    vi.mocked(storage.delete).mockResolvedValue(undefined)
  })

  it('最後一個參照（refCount === 1）刪除後呼叫 storage.delete', async () => {
    vi.mocked(fileRepository.countByStorageKey).mockResolvedValue(1)

    await fileService.delete('att-1', 'user-1', mockUser)

    expect(vi.mocked(storage.delete)).toHaveBeenCalledOnce()
    expect(vi.mocked(storage.delete)).toHaveBeenCalledWith(mockAttachment().storageKey)
  })

  it('仍有其他參照（refCount > 1）時不呼叫 storage.delete', async () => {
    vi.mocked(fileRepository.countByStorageKey).mockResolvedValue(2)

    await fileService.delete('att-1', 'user-1', mockUser)

    expect(vi.mocked(storage.delete)).not.toHaveBeenCalled()
  })
})
