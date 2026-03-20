import { prisma } from '../../lib/db.js'
import { notDeleted } from '../../shared/soft-delete.js'

const userSelect = {
  id: true,
  email: true,
  name: true,
  systemRole: true,
  memberType: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
} as const

export type UserListItem = {
  id: string
  email: string
  name: string | null
  systemRole: string
  memberType: string
  tenantId: string | null
  createdAt: Date
  updatedAt: Date
}

export const userRepository = {
  async findMany(args: { skip: number; take: number }) {
    return prisma.user.findMany({
      where: { ...notDeleted },
      skip: args.skip,
      take: args.take,
      orderBy: { updatedAt: 'desc' },
      select: userSelect,
    }) as Promise<UserListItem[]>
  },

  async count() {
    return prisma.user.count({ where: { ...notDeleted } })
  },

  async findById(id: string) {
    return prisma.user.findFirst({
      where: { id, ...notDeleted },
      select: userSelect,
    }) as Promise<UserListItem | null>
  },

  async findByEmail(email: string) {
    return prisma.user.findFirst({
      where: { email, ...notDeleted },
      select: { id: true },
    })
  },

  async create(data: {
    email: string
    passwordHash: string
    name: string | null
    systemRole: string
    memberType: string
    tenantId: string | null
  }) {
    return prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        systemRole: data.systemRole as 'platform_admin' | 'tenant_admin' | 'project_user',
        memberType: data.memberType || 'internal',
        tenantId: data.tenantId,
      },
      select: userSelect,
    }) as Promise<UserListItem>
  },
}
