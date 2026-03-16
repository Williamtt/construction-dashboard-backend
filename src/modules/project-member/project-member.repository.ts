import { prisma } from '../../lib/db.js'

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
      where: { projectId },
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
      where: { projectId },
      select: { userId: true },
    })
    const excludeIds = existing.map((r: { userId: string }) => r.userId)
    const users = await prisma.user.findMany({
      where: {
        tenantId,
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

  async deleteByProjectAndUser(projectId: string, userId: string) {
    await prisma.projectMember.deleteMany({
      where: { projectId, userId },
    })
  },

  async exists(projectId: string, userId: string): Promise<boolean> {
    const one = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    })
    return !!one
  },

  async updateStatus(
    projectId: string,
    userId: string,
    status: 'active' | 'suspended'
  ): Promise<ProjectMemberItem | null> {
    const updated = await prisma.projectMember.updateMany({
      where: { projectId, userId },
      data: { status },
    })
    if (updated.count === 0) return null
    const list = await this.findManyByProjectId(projectId)
    return list.find((m) => m.userId === userId) ?? null
  },
}
