import { prisma } from '../../lib/db.js'

export const aiTutorRepository = {
  async findLatestConversation(userId: string) {
    return prisma.tutorConversation.findFirst({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    })
  },

  async createConversation(userId: string) {
    return prisma.tutorConversation.create({
      data: { userId, messages: [] },
    })
  },

  async updateMessages(id: string, messages: unknown[]) {
    return prisma.tutorConversation.update({
      where: { id },
      data: { messages },
    })
  },
}
