import { prisma } from '../../lib/db.js'

const ALERT_TTL_MINUTES = 30

export type AlertRecordRow = {
  id: string
  projectId: string | null
  alertType: string
  level: string
  title: string
  value: string
  description: string | null
  startTime: Date | null
  endTime: Date | null
  source: string
  lastSeenAt: Date
  createdAt: Date
}

export type AlertHistoryRow = {
  id: string
  projectId: string | null
  alertType: string
  level: string
  title: string
  value: string
  description: string | null
  startTime: Date | null
  endTime: Date | null
  source: string
  createdAt: Date
}

const alertRecordSelect = {
  id: true,
  projectId: true,
  alertType: true,
  level: true,
  title: true,
  value: true,
  description: true,
  startTime: true,
  endTime: true,
  source: true,
  lastSeenAt: true,
  createdAt: true,
} as const

export const alertsRepository = {
  /** 即時用：取得 lastSeenAt 在 N 分鐘內的紀錄，同類型只留最新一筆 */
  async findCurrentWithinMinutes(
    projectId: string | null,
    minutes: number = ALERT_TTL_MINUTES
  ): Promise<AlertRecordRow[]> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000)
    const rows = await prisma.alertRecord.findMany({
      where: {
        ...(projectId != null ? { projectId } : { projectId: null }),
        lastSeenAt: { gte: cutoff },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: alertRecordSelect,
    })
    const byType = new Map<string, AlertRecordRow>()
    for (const r of rows as AlertRecordRow[]) {
      if (!byType.has(r.alertType)) byType.set(r.alertType, r)
    }
    return Array.from(byType.values())
  },

  /** 即時用：upsert 一筆（同類型同專案只會有一筆，更新 lastSeenAt） */
  async upsertCurrent(data: {
    projectId: string | null
    alertType: string
    level: string
    title: string
    value: string
    description?: string | null
    startTime?: Date | null
    endTime?: Date | null
    source: string
  }) {
    const now = new Date()
    // projectId 可為 null（全站），Prisma 型別對 composite unique 的 null 推論較嚴
    const projectIdKey = data.projectId ?? null
    return prisma.alertRecord.upsert({
      where: {
        alertType_projectId: {
          alertType: data.alertType,
          projectId: projectIdKey as string,
        },
      },
      update: {
        level: data.level,
        title: data.title,
        value: data.value,
        description: data.description ?? null,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        source: data.source,
        lastSeenAt: now,
      },
      create: {
        projectId: data.projectId,
        alertType: data.alertType,
        level: data.level,
        title: data.title,
        value: data.value,
        description: data.description ?? null,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        source: data.source,
        lastSeenAt: now,
      },
      select: alertRecordSelect,
    })
  },

  /** 歷史用：每次寫入即時時一併 insert 一筆 */
  async insertHistory(data: {
    projectId: string | null
    alertType: string
    level: string
    title: string
    value: string
    description?: string | null
    startTime?: Date | null
    endTime?: Date | null
    source: string
  }) {
    return prisma.alertHistoryRecord.create({
      data: {
        projectId: data.projectId,
        alertType: data.alertType,
        level: data.level,
        title: data.title,
        value: data.value,
        description: data.description ?? null,
        startTime: data.startTime ?? null,
        endTime: data.endTime ?? null,
        source: data.source,
      },
    })
  },

  /** 歷史列表：從 alert_history_records 查詢 */
  async findHistoryByDateRange(params: {
    projectId: string | null
    startDate: Date
    endDate: Date
    limit?: number
  }): Promise<AlertHistoryRow[]> {
    const rows = await prisma.alertHistoryRecord.findMany({
      where: {
        ...(params.projectId != null ? { projectId: params.projectId } : {}),
        createdAt: {
          gte: params.startDate,
          lte: params.endDate,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit ?? 100,
    })
    return rows as AlertHistoryRow[]
  },
}
