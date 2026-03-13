import { prisma } from '../../lib/db.js'

const attachmentSelect = {
  id: true,
  projectId: true,
  tenantId: true,
  storageKey: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  fileHash: true,
  category: true,
  businessId: true,
  uploadedById: true,
  createdAt: true,
} as const

export type AttachmentRecord = {
  id: string
  projectId: string
  tenantId: string | null
  storageKey: string
  fileName: string
  fileSize: number
  mimeType: string
  fileHash: string | null
  category: string | null
  businessId: string | null
  uploadedById: string
  createdAt: Date
}

export const fileRepository = {
  async create(data: {
    projectId: string
    tenantId: string | null
    storageKey: string
    fileName: string
    fileSize: number
    mimeType: string
    fileHash: string | null
    category: string | null
    businessId: string | null
    uploadedById: string
  }) {
    return prisma.attachment.create({
      data: {
        projectId: data.projectId,
        tenantId: data.tenantId,
        storageKey: data.storageKey,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        fileHash: data.fileHash,
        category: data.category,
        businessId: data.businessId,
        uploadedById: data.uploadedById,
      },
      select: attachmentSelect,
    }) as Promise<AttachmentRecord>
  },

  async findById(id: string) {
    return prisma.attachment.findUnique({
      where: { id },
      select: attachmentSelect,
    }) as Promise<AttachmentRecord | null>
  },

  /** 依 ID 列表查詢（用於相簿照片列表），保持 createdAt 順序需由呼叫端傳入已排序的 ids */
  async findManyByIds(ids: string[]) {
    if (ids.length === 0) return { items: [], total: 0 }
    const items = await prisma.attachment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        projectId: true,
        tenantId: true,
        storageKey: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        fileHash: true,
        category: true,
        businessId: true,
        uploadedById: true,
        createdAt: true,
        uploadedBy: { select: { name: true } },
      },
    })
    const orderMap = new Map(ids.map((id, i) => [id, i]))
    items.sort((a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0))
    return {
      items: items as (AttachmentRecord & { uploadedBy: { name: string | null } })[],
      total: items.length,
    }
  },

  async findByProjectId(projectId: string, args: { skip: number; take: number; category?: string }) {
    const where = { projectId, ...(args.category ? { category: args.category } : {}) }
    const [items, total] = await Promise.all([
      prisma.attachment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: args.skip,
        take: args.take,
        select: {
          id: true,
          projectId: true,
          tenantId: true,
          storageKey: true,
          fileName: true,
          fileSize: true,
          mimeType: true,
          fileHash: true,
          category: true,
          businessId: true,
          uploadedById: true,
          createdAt: true,
          uploadedBy: { select: { name: true } },
        },
      }),
      prisma.attachment.count({ where }),
    ])
    return {
      items: items as (AttachmentRecord & { uploadedBy: { name: string | null } })[],
      total,
    }
  },

  async countByStorageKey(storageKey: string) {
    return prisma.attachment.count({ where: { storageKey } })
  },

  async findByProjectAndHash(projectId: string, fileHash: string) {
    return prisma.attachment.findFirst({
      where: { projectId, fileHash },
      select: attachmentSelect,
    }) as Promise<AttachmentRecord | null>
  },

  /** 租戶總儲存量：依 storageKey 去重後加總 fileSize（方案 B） */
  async getTenantStorageUsageBytes(tenantId: string): Promise<number> {
    const rows = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(t.file_size), 0)::bigint AS total
      FROM (
        SELECT DISTINCT ON (storage_key) storage_key, file_size
        FROM attachments
        WHERE tenant_id = ${tenantId}
      ) t
    `
    return Number(rows[0]?.total ?? 0)
  },

  /** 若無去重，簡化版：直接 SUM(fileSize) */
  async getTenantStorageUsageBytesSimple(tenantId: string): Promise<number> {
    const r = await prisma.attachment.aggregate({
      where: { tenantId },
      _sum: { fileSize: true },
    })
    return r._sum.fileSize ?? 0
  },

  async delete(id: string) {
    return prisma.attachment.delete({
      where: { id },
      select: { storageKey: true, fileSize: true, tenantId: true },
    })
  },
}
