import { prisma } from '../../lib/db.js'
import type { NotificationType } from '@prisma/client'

export interface CreateNotificationInput {
  userId: string
  tenantId?: string | null
  projectId?: string | null
  type: NotificationType
  title: string
  body: string
  link?: string | null
  sourceId?: string | null
}

export const notificationsRepository = {
  async create(input: CreateNotificationInput) {
    return prisma.notification.create({ data: input })
  },

  async createMany(inputs: CreateNotificationInput[]) {
    return prisma.notification.createMany({ data: inputs, skipDuplicates: true })
  },

  async findByUser(userId: string, limit = 50) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  },

  async countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, isRead: false } })
  },

  async markAsRead(id: string, userId: string) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    })
  },

  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    })
  },
}
