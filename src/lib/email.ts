/**
 * Email 發送服務。
 *
 * 使用 Resend（需安裝 resend 套件）。
 * 若未設定 RESEND_API_KEY 則退化為 console.log（開發模式）。
 */

const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() || ''
const EMAIL_FROM = process.env.EMAIL_FROM?.trim() || 'noreply@example.com'
const FRONTEND_URL = process.env.FRONTEND_URL?.trim() || 'http://localhost:5175'

interface SendEmailParams {
  to: string
  subject: string
  html: string
}

async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('[Email-Dev] 未設定 RESEND_API_KEY，跳過寄信：')
    console.log(`  To: ${params.to}`)
    console.log(`  Subject: ${params.subject}`)
    console.log(`  Body: ${params.html}`)
    return
  }

  const { Resend } = await import('resend')
  const resend = new Resend(RESEND_API_KEY)

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: params.to,
    subject: params.subject,
    html: params.html,
  })

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`)
  }
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
