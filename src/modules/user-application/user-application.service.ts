import bcrypt from 'bcrypt'
import { AppError } from '../../shared/errors.js'
import { userRepository } from '../user/user.repository.js'
import { userApplicationRepository } from './user-application.repository.js'
import { sendApprovalEmail, sendRejectionEmail } from '../../lib/email.js'
import { prisma } from '../../lib/db.js'
import type { SubmitApplicationBody } from '../../schemas/application.js'

export const userApplicationService = {
  /** 學生提交申請 */
  async submit(data: SubmitApplicationBody) {
    // 檢查 email 是否已被註冊
    const existingUser = await userRepository.findByEmail(data.email)
    if (existingUser) {
      throw new AppError(409, 'CONFLICT', '此 Email 已註冊')
    }

    // 檢查是否已有 pending 申請
    const pendingApp = await userApplicationRepository.findPendingByEmail(data.email)
    if (pendingApp) {
      throw new AppError(409, 'CONFLICT', '此 Email 已有一筆審核中的申請')
    }

    // 用 slug 查詢租戶
    const tenant = await prisma.tenant.findFirst({
      where: { slug: data.tenantSlug, deletedAt: null, status: 'active' },
      select: { id: true },
    })
    if (!tenant) {
      throw new AppError(404, 'NOT_FOUND', '租戶代碼無效，請確認後再試')
    }

    const passwordHash = await bcrypt.hash(data.password, 10)

    return userApplicationRepository.create({
      email: data.email,
      passwordHash,
      name: data.name,
      studentId: data.studentId ?? null,
      department: data.department ?? null,
      tenantId: tenant.id,
    })
  },

  /** 管理員核准申請 */
  async approve(applicationId: string, reviewerId: string) {
    const app = await userApplicationRepository.findById(applicationId)
    if (!app) {
      throw new AppError(404, 'NOT_FOUND', '找不到該申請')
    }
    if (app.status !== 'pending') {
      throw new AppError(400, 'BAD_REQUEST', '此申請已處理')
    }

    // 再次檢查 email 未被註冊
    const existingUser = await userRepository.findByEmail(app.email)
    if (existingUser) {
      throw new AppError(409, 'CONFLICT', '此 Email 已被註冊，無法核准')
    }

    // 建立 User
    const user = await userRepository.create({
      email: app.email,
      passwordHash: app.passwordHash,
      name: app.name,
      systemRole: 'project_user',
      memberType: 'external',
      tenantId: app.tenantId,
    })

    // 更新申請狀態
    await userApplicationRepository.updateStatus(applicationId, {
      status: 'approved',
      reviewedById: reviewerId,
      reviewedAt: new Date(),
    })

    // 寄送核准通知信（不阻塞）
    sendApprovalEmail(app.email, app.name).catch((e) =>
      console.error('sendApprovalEmail failed:', e)
    )

    return user
  },

  /** 管理員拒絕申請 */
  async reject(applicationId: string, reviewerId: string, rejectReason: string) {
    const app = await userApplicationRepository.findById(applicationId)
    if (!app) {
      throw new AppError(404, 'NOT_FOUND', '找不到該申請')
    }
    if (app.status !== 'pending') {
      throw new AppError(400, 'BAD_REQUEST', '此申請已處理')
    }

    const updated = await userApplicationRepository.updateStatus(applicationId, {
      status: 'rejected',
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      rejectReason,
    })

    // 寄送拒絕通知信（不阻塞）
    sendRejectionEmail(app.email, app.name, rejectReason).catch((e) =>
      console.error('sendRejectionEmail failed:', e)
    )

    return updated
  },
}
