import { AppError } from '../../shared/errors.js'
import { aiTutorRepository } from './ai-tutor.repository.js'

const AI_TUTOR_URL = process.env.AI_TUTOR_URL || 'http://localhost:8000'
const AI_TUTOR_SERVICE_KEY = process.env.AI_TUTOR_SERVICE_KEY || ''

interface Message {
  role: string
  content: string
}

interface ChatResult {
  answer: string
  sources: Array<{ title: string; category: string }>
}

export async function chat(userId: string, message: string, pageContext?: string): Promise<ChatResult> {
  let conv = await aiTutorRepository.findLatestConversation(userId)
  if (!conv) conv = await aiTutorRepository.createConversation(userId)

  const messages = (conv.messages as unknown as Message[]) || []

  // Sliding window: last 5 rounds (10 messages)
  const recent = messages.slice(-10)

  const resp = await fetch(`${AI_TUTOR_URL}/api/ai-tutor/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Service-Key': AI_TUTOR_SERVICE_KEY,
    },
    body: JSON.stringify({
      message,
      system: 'dashboard',
      conversation_history: recent,
      page_context: pageContext,
    }),
  })

  if (!resp.ok) {
    throw new AppError(502, 'AI_SERVICE_ERROR', 'AI 服務暫時無法使用')
  }

  const result = (await resp.json()) as ChatResult

  // Append to conversation history
  messages.push({ role: 'user', content: message })
  messages.push({ role: 'assistant', content: result.answer })
  await aiTutorRepository.updateMessages(conv.id, messages)

  return result
}

export async function getHistory(userId: string) {
  const conv = await aiTutorRepository.findLatestConversation(userId)
  if (!conv) return { messages: [] }
  return { messages: conv.messages as unknown as Message[] }
}

export async function newConversation(userId: string) {
  await aiTutorRepository.createConversation(userId)
  return { success: true }
}
