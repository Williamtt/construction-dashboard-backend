import { prisma } from '../../lib/db.js'

export type FormTemplateRecord = {
  id: string
  tenantId: string | null
  projectId: string | null
  name: string
  description: string | null
  storageKey: string
  fileName: string
  fileSize: number
  mimeType: string
  fileHash: string | null
  uploadedById: string
  createdAt: Date
  updatedAt: Date
}

const select = {
  id: true,
  tenantId: true,
  projectId: true,
  name: true,
  description: true,
  storageKey: true,
  fileName: true,
  fileSize: true,
  mimeType: true,
  fileHash: true,
  uploadedById: true,
  createdAt: true,
  updatedAt: true,
} as const

export const formTemplateRepository = {
  async create(data: {
    tenantId: string | null
    projectId: string | null
    name: string
    description: string | null
    storageKey: string
    fileName: string
    fileSize: number
    mimeType: string
    fileHash: string | null
    uploadedById: string
  }): Promise<FormTemplateRecord> {
    const row = await prisma.formTemplate.create({
      data: {
        tenantId: data.tenantId,
        projectId: data.projectId,
        name: data.name,
        description: data.description,
        storageKey: data.storageKey,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        fileHash: data.fileHash,
        uploadedById: data.uploadedById,
      },
      select,
    })
    return row as FormTemplateRecord
  },

  async findById(id: string): Promise<(FormTemplateRecord & { uploadedBy?: { name: string | null } }) | null> {
    const row = await prisma.formTemplate.findUnique({
      where: { id },
      select: {
        ...select,
        uploadedBy: { select: { name: true } },
      },
    })
    return row as (FormTemplateRecord & { uploadedBy?: { name: string | null } }) | null
  },

  /** 後台預設樣板：tenantId 有值、projectId 為 null */
  async findDefaultByTenantId(tenantId: string): Promise<(FormTemplateRecord & { uploaderName?: string | null })[]> {
    const rows = await prisma.formTemplate.findMany({
      where: { tenantId, projectId: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        ...select,
        uploadedBy: { select: { name: true } },
      },
    })
    return rows.map((r: FormTemplateRecord & { uploadedBy?: { name: string | null } }) => ({
      ...r,
      uploaderName: r.uploadedBy?.name ?? null,
    })) as (FormTemplateRecord & { uploaderName?: string | null })[]
  },

  /** 專案可見：該租戶的預設樣板 + 該專案的自訂樣板 */
  async findForProject(projectId: string, tenantId: string | null): Promise<(FormTemplateRecord & { uploaderName?: string | null })[]> {
    const where = tenantId
      ? { OR: [{ tenantId, projectId: null }, { projectId }] }
      : { projectId }
    const rows = await prisma.formTemplate.findMany({
      where,
      orderBy: [{ projectId: 'asc' }, { updatedAt: 'desc' }],
      select: {
        ...select,
        uploadedBy: { select: { name: true } },
      },
    })
    return rows.map((r: FormTemplateRecord & { uploadedBy?: { name: string | null } }) => ({
      ...r,
      uploaderName: r.uploadedBy?.name ?? null,
    })) as (FormTemplateRecord & { uploaderName?: string | null })[]
  },

  async update(id: string, data: { name?: string; description?: string | null }): Promise<FormTemplateRecord> {
    const row = await prisma.formTemplate.update({
      where: { id },
      data: {
        ...(data.name != null && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
      select,
    })
    return row as FormTemplateRecord
  },

  async delete(id: string): Promise<{ storageKey: string } | null> {
    const row = await prisma.formTemplate.delete({
      where: { id },
      select: { storageKey: true },
    })
    return row
  },
}
