import { prisma } from '../../lib/db.js'

export const photoFavoriteRepository = {
  async add(userId: string, attachmentId: string): Promise<void> {
    await prisma.userPhotoFavorite.upsert({
      where: {
        userId_attachmentId: { userId, attachmentId },
      },
      create: { userId, attachmentId },
      update: {},
    })
  },

  async remove(userId: string, attachmentId: string): Promise<void> {
    await prisma.userPhotoFavorite.deleteMany({
      where: { userId, attachmentId },
    })
  },

  async findAttachmentIdsByUserAndProject(userId: string, projectId: string): Promise<string[]> {
    const rows = await prisma.userPhotoFavorite.findMany({
      where: {
        userId,
        attachment: { projectId },
      },
      orderBy: { createdAt: 'desc' },
      select: { attachmentId: true },
    })
    return rows.map((r: { attachmentId: string }) => r.attachmentId)
  },
}
