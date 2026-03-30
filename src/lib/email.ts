/**
 * Email 發送服務。
 *
 * 使用 Gmail SMTP（nodemailer + Google App Password）。
 * 若未設定 SMTP_USER 則退化為 console.log（開發模式）。
 *
 * 需要的環境變數：
 *   SMTP_USER     — Gmail 帳號（如 yourname@gmail.com）
 *   SMTP_PASS     — Google 應用程式密碼（16 碼）
 *   EMAIL_FROM    — 寄件者顯示名稱+地址（如 "系統通知 <yourname@gmail.com>"）
 *   FRONTEND_URL  — 前端網址
 */
import nodemailer from 'nodemailer'

const SMTP_USER = process.env.SMTP_USER?.trim() || ''
const SMTP_PASS = process.env.SMTP_PASS?.trim() || ''
const EMAIL_FROM = process.env.EMAIL_FROM?.trim() || SMTP_USER || 'noreply@example.com'
const FRONTEND_URL = process.env.FRONTEND_URL?.trim() || 'http://localhost:5175'

const transporter =
  SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        service: 'gmail',
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null

interface SendEmailParams {
  to: string
  subject: string
  html: string
}

async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!transporter) {
    console.log('[Email-Dev] 未設定 SMTP_USER/SMTP_PASS，跳過寄信：')
    console.log(`  To: ${params.to}`)
    console.log(`  Subject: ${params.subject}`)
    console.log(`  Body: ${params.html}`)
    return
  }

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
  })
}

/** 核准通知信 */
export async function sendApprovalEmail(to: string, name: string): Promise<void> {
  const loginUrl = `${FRONTEND_URL}/login`
  await sendEmail({
    to,
    subject: '您的帳號申請已通過審核',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>帳號申請已通過</h2>
        <p>${name} 您好，</p>
        <p>您的帳號申請已通過審核，請使用申請時填寫的 Email 與密碼登入系統：</p>
        <p style="margin: 24px 0;">
          <a href="${loginUrl}" style="background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
            前往登入
          </a>
        </p>
        <p style="color: #6b7280; font-size: 14px;">
          帳號：${to}<br>
          密碼：您申請時設定的密碼
        </p>
      </div>
    `,
  })
}

/** 拒絕通知信 */
export async function sendRejectionEmail(
  to: string,
  name: string,
  reason: string
): Promise<void> {
  await sendEmail({
    to,
    subject: '您的帳號申請未通過',
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>帳號申請未通過</h2>
        <p>${name} 您好，</p>
        <p>很遺憾，您的帳號申請未通過審核。</p>
        <p><strong>原因：</strong>${reason}</p>
        <p style="color: #6b7280; font-size: 14px;">如有疑問，請聯繫管理員。</p>
      </div>
    `,
  })
}
