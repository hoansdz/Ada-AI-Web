import { proxyRequest } from '@/lib/api'

export const runtime = 'nodejs'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatCompletionRequest = {
  model: string
  messages: ChatMessage[]
  agentInstructions: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (
    !isRecord(value) ||
    typeof value.content !== 'string' ||
    value.content.length > 20000
  ) {
    return false
  }

  return value.role === 'system' || value.role === 'user' || value.role === 'assistant'
}

function isChatCompletionRequest(value: unknown): value is ChatCompletionRequest {
  return (
    isRecord(value) &&
    typeof value.model === 'string' &&
    value.model.length > 0 &&
    value.model.length <= 120 &&
    Array.isArray(value.messages) &&
    value.messages.length > 0 &&
    value.messages.length <= 100 &&
    value.messages.every(isChatMessage) &&
    typeof value.agentInstructions === 'string' &&
    value.agentInstructions.length <= 12000
  )
}

export async function POST(request: Request): Promise<Response> {
  const authorization = request.headers.get('authorization')
  if (
    !authorization?.toLowerCase().startsWith('bearer ') ||
    !authorization.slice(7).trim()
  ) {
    return Response.json(
      { error: { message: 'Cần kết nối API key cá nhân để sử dụng Ada AI.' } },
      { status: 401 }
    )
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return Response.json(
      { error: { message: 'Nội dung yêu cầu phải là JSON hợp lệ.' } },
      { status: 400 }
    )
  }

  if (!isChatCompletionRequest(payload)) {
    return Response.json(
      { error: { message: 'Dữ liệu chat không hợp lệ hoặc vượt quá giới hạn.' } },
      { status: 400 }
    )
  }

  const messages = payload.messages.map(({ role, content }) => ({ role, content }))
  if (payload.agentInstructions.trim()) {
    const firstConversationMessage = messages.findIndex(
      (message) => message.role !== 'system'
    )
    const insertionIndex = firstConversationMessage === -1
      ? messages.length
      : firstConversationMessage

    messages.splice(insertionIndex, 0, {
      role: 'system',
      content: `Chỉ dẫn riêng dành cho Agent Ada AI v1:\n${payload.agentInstructions.trim()}`,
    })
  }

  return proxyRequest('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authorization.slice(7).trim()}`,
    },
    body: JSON.stringify({
      model: payload.model,
      messages,
      stream: false,
    }),
  })
}
