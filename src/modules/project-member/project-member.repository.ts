import { prisma } from '../../lib/db.js'
import { notDeleted, softDeleteSet } from '../../shared/soft-delete.js'

export type ProjectMemberItem = {
  id: string
  projectId: string
  userId: string
  role: string
  status: string
  createdAt: Date
  updatedAt: Date
  user: {
    id: string
    email: string
    name: string | null
    systemRole: string
    memberType: string
    status: string
  }
}

export const projectMemberRepository = {
  async findManyByProjectId(projectId: string): Promise<ProjectMemberItem[]> {
    const rows = await prisma.projectMember.findMany({
      where: { projectId, ...notDeleted, user: notDeleted },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        projectId: true,
        userId: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            systemRole: true,
            memberType: true,
            status: true,
          },
        },
      },
    })
    return rows as ProjectMemberItem[]
  },

  async findTenantUsersNotInProject(
    projectId: string,
    tenantId: string,
    limit: number
  ): Promise<{ id: string; email: string; name: string | null }[]> {
    const existing = await prisma.projectMember.findMany({
      where: { projectId, ...notDeleted },
      select: { userId: true },
    })
    const excludeIds = existing.map((r: { userId: string }) => r.userId)
    const users = await prisma.user.findMany({
      where: {
        tenantId,
        ...notDeleted,
        id: { notIn: excludeIds },
        status: 'active',
      },
      take: limit,
      orderBy: { name: 'asc' },
      select: { id: true, email: true, name: true },
    })
    return users
  },

  async create(projectId: string, userId: string, role: 'project_admin' | 'member' | 'viewer' = 'member') {
    const prev = await prisma.projectMember.findFirst({
      where: { projectId, userId },
    })
    if (prev) {
      if (prev.deletedAt != null) {
        return prisma.projectMember.update({
          where: { id: prev.id },
          data: {
            deletedAt: null,
            deletedById: null,
            role,
            status: 'active',
          },
          select: {
            id: true,
            projectId: true,
            userId: true,
            role: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      }
      throw new Error('PROJECT_MEMBER_ALREADY_ACTIVE')
    }
    return prisma.projectMember.create({
      data: { projectId, userId, role },
      select: {
        id: true,
        projectId: true,
        userId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    })
  },

  async deleteByProjectAndUser(projectId: string, userId: string, deletedById: string) {
    await prisma.projectMember.updateMany({
      where: { projectId, userId, ...notDeleted },
      data: softDeleteSet(deletedById),
    })
  },

  async exists(projectId: string, userId: string): Promise<boolean> {
    const one = await prisma.projectMember.findFirst({
      where: { projectId, userId, ...notDeleted },
    })
    return !!one
  },

  async updateStatus(
    projectId: string,
    userId: string,
    status: 'active' | 'suspended'
  ): Promise<ProjectMemberItem | null> {
    const updated = await prisma.projectMember.updateMany({
      where: { projectId, userId, ...notDeleted },
      data: { status },
    })
    if (updated.count === 0) return null
    const list = await this.findManyByProjectId(projectId)
    return list.find((m) => m.userId === userId) ?? null
  },
}
