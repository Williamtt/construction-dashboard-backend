import type { NotificationType } from '@prisma/client'
import { prisma } from '../../lib/db.js'
import { notificationsRepository, type CreateNotificationInput } from './notifications.repository.js'

export async function createNotification(input: CreateNotificationInput) {
  return notificationsRepository.create(input)
}

export async function createNotificationForProjectMembers(
  projectId: string,
  type: NotificationType,
  title: string,
  body: string,
  link?: string,
  sourceId?: string
) {
  const members = await prisma.projectMember.findMany({
    where: { projectId, deletedAt: null },
    select: { userId: true, project: { select: { tenantId: true } } },
  })
  if (members.length === 0) return

  const tenantId = members[0].project.tenantId
  const inputs: CreateNotificationInput[] = members.map((m) => ({
    userId: m.userId,
    tenantId,
    projectId,
    type,
    title,
    body,
    link: link ?? null,
    sourceId: sourceId ?? null,
  }))
  return notificationsRepository.createMany(inputs)
}

export async function createNotificationForProjectAdmins(
  projectId: string,
  type: NotificationType,
  title: string,
  body: string,
  link?: string,
  sourceId?: string
) {
  const admins = await prisma.projectMember.findMany({
    where: { projectId, role: 'project_admin', deletedAt: null },
    select: { userId: true, project: { select: { tenantId: true } } },
  })
  if (admins.length === 0) return

  const tenantId = admins[0].project.tenantId
  const inputs: CreateNotificationInput[] = admins.map((m) => ({
    userId: m.userId,
    tenantId,
    projectId,
    type,
    title,
    body,
    link: link ?? null,
    sourceId: sourceId ?? null,
  }))
  return notificationsRepository.createMany(inputs)
}

export async function listNotifications(userId: string, limit = 50) {
  return notificationsRepository.findByUser(userId, limit)
}

export async function getUnreadCount(userId: string) {
  return notificationsRepository.countUnread(userId)
}

export async function markAsRead(id: string, userId: string) {
  return notificationsRepository.markAsRead(id, userId)
}

export async function markAllAsRead(userId: string) {
  return notificationsRepository.markAllAsRead(userId)
}
