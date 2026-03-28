import { prisma } from '../../lib/db.js'

const selectFields = {
  id: true,
  email: true,
  name: true,
  studentId: true,
  department: true,
  status: true,
  tenantId: true,
  reviewedById: true,
  reviewedAt: true,
  rejectReason: true,
  createdAt: true,
  updatedAt: true,
} as const

export type ApplicationListItem = {
  id: string
  email: string
  name: string
  studentId: string | null
  department: string | null
  status: string
  tenantId: string
  reviewedById: string | null
  reviewedAt: Date | null
  rejectReason: string | null
  createdAt: Date
  updatedAt: Date
}

export const userApplicationRepository = {
  async findById(id: string) {
    return prisma.userApplicationRequest.findFirst({
      where: { id },
      select: { ...selectFields, passwordHash: true },
    })
  },

  async findByIdPublic(id: string) {
    return prisma.userApplicationRequest.findFirst({
      where: { id },
      select: selectFields,
    }) as Promise<ApplicationListItem | null>
  },

  async findPendingByEmail(email: string) {
    return prisma.userApplicationRequest.findFirst({
      where: { email, status: 'pending' },
      select: { id: true },
    })
  },

  async findMany(args: {
    tenantId: string
    status?: string
    skip: number
    take: number
  }) {
    const where: { tenantId: string; status?: string } = {
      tenantId: args.tenantId,
    }
    if (args.status) where.status = args.status

    return prisma.userApplicationRequest.findMany({
      where,
      skip: args.skip,
      take: args.take,
      orderBy: { createdAt: 'desc' },
      select: selectFields,
    }) as Promise<ApplicationListItem[]>
  },

  async count(args: { tenantId: string; status?: string }) {
    const where: { tenantId: string; status?: string } = {
      tenantId: args.tenantId,
    }
    if (args.status) where.status = args.status
    return prisma.userApplicationRequest.count({ where })
  },

  async create(data: {
    email: string
    passwordHash: string
    name: string
    studentId: string | null
    department: string | null
    tenantId: string
  }) {
    return prisma.userApplicationRequest.create({
      data,
      select: selectFields,
    }) as Promise<ApplicationListItem>
  },

  async updateStatus(
    id: string,
    data: {
      status: string
      reviewedById: string
      reviewedAt: Date
      rejectReason?: string | null
    }
  ) {
    return prisma.userApplicationRequest.update({
      where: { id },
      data,
      select: selectFields,
    }) as Promise<ApplicationListItem>
  },
}
