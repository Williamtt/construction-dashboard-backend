import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

const select = {
  id: true,
  projectId: true,
  tenantId: true,
  name: true,
  streamToken: true,
  connectionMode: true,
  status: true,
  lastStreamAt: true,
  connectionStatusOverride: true,
  createdAt: true,
  updatedAt: true,
  // sourceUrlEnc 不選出，需時由 service 解密
} as const

export type CameraRecord = {
  id: string
  projectId: string
  tenantId: string | null
  name: string
  streamToken: string
  connectionMode: string
  status: string
  lastStreamAt: Date | null
  connectionStatusOverride: string | null
  createdAt: Date
  updatedAt: Date
}

export const cameraRepository = {
  async create(data: {
    projectId: string
    tenantId: string | null
    name: string
    streamToken: string
    connectionMode: string
    sourceUrlEnc: string | null
    status: string
  }) {
    const row = await prisma.camera.create({
      data: {
        projectId: data.projectId,
        tenantId: data.tenantId,
        name: data.name,
        streamToken: data.streamToken,
        connectionMode: data.connectionMode,
        sourceUrlEnc: data.sourceUrlEnc,
        status: data.status,
      },
      select: { ...select, sourceUrlEnc: true },
    })
    const { sourceUrlEnc: _, ...rest } = row
    return rest as CameraRecord
  },

  async findById(cameraId: string) {
    return prisma.camera.findFirst({
      where: { id: cameraId, ...notDeleted },
      select,
    })
  },

  /** 取得單一攝影機（含 sourceUrlEnc，供設定頁解析 RTSP 用） */
  async findByIdWithSourceEnc(cameraId: string) {
    return prisma.camera.findFirst({
      where: { id: cameraId, ...notDeleted },
      select: { ...select, sourceUrlEnc: true },
    })
  },

  async findByProjectId(projectId: string, options?: { status?: string }) {
    const where: { projectId: string; status?: string } & typeof notDeleted = { projectId, ...notDeleted }
    if (options?.status) where.status = options.status
    const rows = await prisma.camera.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select,
    })
    return rows as CameraRecord[]
  },

  /** 專案內攝影機的 streamToken + sourceUrlEnc，供產出安裝包 YAML 用 */
  async findByProjectIdWithSourceEnc(projectId: string) {
    return prisma.camera.findMany({
      where: { projectId, ...notDeleted },
      orderBy: { createdAt: 'asc' },
      select: { streamToken: true, sourceUrlEnc: true },
    })
  },

  async findByStreamToken(streamToken: string) {
    return prisma.camera.findFirst({
      where: { streamToken, ...notDeleted },
      select: { ...select, sourceUrlEnc: true },
    })
  },

  async updateLastStreamAt(cameraId: string, lastStreamAt: Date) {
    await prisma.camera.updateMany({
      where: { id: cameraId, ...notDeleted },
      data: { lastStreamAt },
    })
  },

  async update(
    cameraId: string,
    data: { name?: string; status?: string; sourceUrlEnc?: string | null; connectionStatusOverride?: string | null }
  ) {
    const n = await prisma.camera.updateMany({
      where: { id: cameraId, ...notDeleted },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.sourceUrlEnc !== undefined && { sourceUrlEnc: data.sourceUrlEnc }),
        ...(data.connectionStatusOverride !== undefined && { connectionStatusOverride: data.connectionStatusOverride }),
      },
    })
    if (n.count === 0) {
      throw new Error('CAMERA_NOT_FOUND_OR_DELETED')
    }
    const row = await prisma.camera.findFirst({
      where: { id: cameraId, ...notDeleted },
      select: { ...select, sourceUrlEnc: true },
    })
    if (!row) throw new Error('CAMERA_NOT_FOUND_OR_DELETED')
    const { sourceUrlEnc: _, ...rest } = row
    return rest as CameraRecord
  },

  async softDelete(cameraId: string, deletedById: string) {
    await prisma.camera.updateMany({
      where: { id: cameraId, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },
}
