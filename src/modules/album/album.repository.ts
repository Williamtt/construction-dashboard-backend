import { prisma } from '../../lib/db.js'

export type AlbumRecord = {
  id: string
  projectId: string
  name: string
  createdAt: Date
}

export const albumRepository = {
  async create(projectId: string, name: string): Promise<AlbumRecord> {
    const row = await prisma.photoAlbum.create({
      data: { projectId, name },
      select: { id: true, projectId: true, name: true, createdAt: true },
    })
    return row as AlbumRecord
  },

  async findById(id: string): Promise<AlbumRecord | null> {
    const row = await prisma.photoAlbum.findUnique({
      where: { id },
      select: { id: true, projectId: true, name: true, createdAt: true },
    })
    return row as AlbumRecord | null
  },

  async findByProjectId(projectId: string): Promise<AlbumRecord[]> {
    const rows = await prisma.photoAlbum.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, projectId: true, name: true, createdAt: true },
    })
    return rows as AlbumRecord[]
  },

  async delete(id: string): Promise<void> {
    await prisma.photoAlbum.delete({ where: { id } })
  },

  async addPhoto(albumId: string, attachmentId: string): Promise<void> {
    await prisma.albumPhoto.upsert({
      where: {
        albumId_attachmentId: { albumId, attachmentId },
      },
      create: { albumId, attachmentId },
      update: {},
    })
  },

  async removePhoto(albumId: string, attachmentId: string): Promise<void> {
    await prisma.albumPhoto.delete({
      where: {
        albumId_attachmentId: { albumId, attachmentId },
      },
    })
  },

  async getAttachmentIds(albumId: string): Promise<string[]> {
    const rows = await prisma.albumPhoto.findMany({
      where: { albumId },
      orderBy: { attachmentId: 'asc' },
      select: { attachmentId: true },
    })
    return rows.map((r: { attachmentId: string }) => r.attachmentId)
  },
}
