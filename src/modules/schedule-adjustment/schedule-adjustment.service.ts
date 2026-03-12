import { prisma } from '../../lib/db.js'
import { AppError } from '../../shared/errors.js'
import { scheduleAdjustmentRepository, type ScheduleAdjustmentItem } from './schedule-adjustment.repository.js'
import type { CreateScheduleAdjustmentBody, UpdateScheduleAdjustmentBody } from '../../schemas/scheduleAdjustment.js'

type AuthUser = {
  systemRole: 'platform_admin' | 'tenant_admin' | 'project_user'
  tenantId: string | null
}

function parseDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

async function ensureProjectAccess(projectId: string, user: AuthUser): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { tenantId: true },
  })
  if (!project) {
    throw new AppError(404, 'NOT_FOUND', '找不到該專案')
  }
  if (user.systemRole !== 'platform_admin' && project.tenantId !== user.tenantId) {
    throw new AppError(403, 'FORBIDDEN', '無權限操作此專案的工期調整')
  }
}

export const scheduleAdjustmentService = {
  async list(projectId: string, user: AuthUser): Promise<ScheduleAdjustmentItem[]> {
    await ensureProjectAccess(projectId, user)
    return scheduleAdjustmentRepository.findManyByProjectId(projectId)
  },

  async create(projectId: string, data: CreateScheduleAdjustmentBody, user: AuthUser): Promise<ScheduleAdjustmentItem> {
    await ensureProjectAccess(projectId, user)
    const applyDate = parseDate(data.applyDate)
    if (!applyDate) {
      throw new AppError(400, 'VALIDATION_ERROR', '申請日期格式錯誤')
    }
    return scheduleAdjustmentRepository.create({
      projectId,
      applyDate,
      type: data.type,
      applyDays: data.applyDays,
      approvedDays: data.approvedDays,
      status: data.status ?? 'pending',
    })
  },

  async update(
    projectId: string,
    id: string,
    data: UpdateScheduleAdjustmentBody,
    user: AuthUser
  ): Promise<ScheduleAdjustmentItem> {
    await ensureProjectAccess(projectId, user)
    const existing = await scheduleAdjustmentRepository.findById(id)
    if (!existing || existing.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該筆工期調整')
    }
    const payload: Parameters<typeof scheduleAdjustmentRepository.update>[1] = {}
    if (data.applyDate !== undefined) {
      const d = parseDate(data.applyDate)
      if (data.applyDate !== '' && !d) throw new AppError(400, 'VALIDATION_ERROR', '申請日期格式錯誤')
      payload.applyDate = d ?? existing.applyDate
    }
    if (data.type !== undefined) payload.type = data.type
    if (data.applyDays !== undefined) payload.applyDays = data.applyDays
    if (data.approvedDays !== undefined) payload.approvedDays = data.approvedDays
    if (data.status !== undefined) payload.status = data.status
    return scheduleAdjustmentRepository.update(id, payload)
  },

  async delete(projectId: string, id: string, user: AuthUser): Promise<void> {
    await ensureProjectAccess(projectId, user)
    const existing = await scheduleAdjustmentRepository.findById(id)
    if (!existing || existing.projectId !== projectId) {
      throw new AppError(404, 'NOT_FOUND', '找不到該筆工期調整')
    }
    await scheduleAdjustmentRepository.delete(id)
  },
}
