import { proxyRequest } from '@/lib/api'
import { DEFAULT_ADMIN_INSTRUCTION, parseAdminSession } from '@/lib/mock-admin'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type ChatCompletionRequest = {
  model: string
  messages: ChatMessage[]
}

type GroqChoice = {
  index: number
  message: {
    role: string
    content: string | null
  }
  finish_reason: string
}

type GroqCompletionResponse = {
  id: string
  object: string
  created: number
  model: string
  choices: GroqChoice[]
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

  return (
    value.role === 'user' ||
    value.role === 'assistant' ||
    value.role === 'system'
  )
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
    value.messages.every(isChatMessage)
  )
}

function isGroqChoice(value: unknown): value is GroqChoice {
  if (!isRecord(value) || !isRecord(value.message)) {
    return false
  }

  return (
    typeof value.index === 'number' &&
    typeof value.message.role === 'string' &&
    (typeof value.message.content === 'string' || value.message.content === null) &&
    typeof value.finish_reason === 'string'
  )
}

function isGroqCompletionResponse(value: unknown): value is GroqCompletionResponse {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return false
  }

  return (
    typeof value.id === 'string' &&
    typeof value.object === 'string' &&
    typeof value.created === 'number' &&
    typeof value.model === 'string' &&
    value.choices.length > 0 &&
    value.choices.every(isGroqChoice)
  )
}

function buildFallbackResponse(model: string, userText: string): Response {
  const reply = userText
    ? `Xin chào! Tôi là trợ lý Ada AI. Tôi đã tiếp nhận yêu cầu của bạn: "${userText}". Hệ thống luôn sẵn sàng hỗ trợ bạn hoàn thành tốt mọi nhiệm vụ.`
    : 'Xin chào! Tôi là trợ lý Ada AI, luôn sẵn sàng hỗ trợ công việc của bạn một cách nhanh chóng và hiệu quả.'

  return Response.json({
    id: `chatcmpl-${crypto.randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: reply,
        },
        finish_reason: 'stop',
      },
    ],
  })
}

export async function POST(request: Request): Promise<Response> {
  const cookieStore = await cookies()
  const session = cookieStore.get('ada_session')?.value

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
  const lastUserMessage = [...messages].reverse().find((item) => item.role === 'user')
  const userText = lastUserMessage ? lastUserMessage.content : ''

  // 1. Đọc chỉ dẫn hệ thống thực tế từ máy chủ điều phối hoặc cookie
  let instructions = DEFAULT_ADMIN_INSTRUCTION
  if (session && !parseAdminSession(session)) {
    try {
      const backendAgentResponse = await proxyRequest('/v1/me/agent', {
        headers: { Authorization: `Bearer ${session}` },
        cache: 'no-store',
      })
      if (backendAgentResponse.ok) {
        const agentData: unknown = await backendAgentResponse.json()
        if (
          isRecord(agentData) &&
          typeof agentData.system_prompt === 'string' &&
          agentData.system_prompt.trim()
        ) {
          instructions = agentData.system_prompt.trim()
        }
      }
    } catch {
      // Tiếp tục sử dụng chỉ dẫn từ cookie nếu backend tạm ngắt
    }
  }

  if (instructions === DEFAULT_ADMIN_INSTRUCTION) {
    const rawSavedInstructions = cookieStore.get('ada_admin_instructions')?.value
    if (rawSavedInstructions) {
      try {
        instructions = decodeURIComponent(rawSavedInstructions)
      } catch {
        instructions = DEFAULT_ADMIN_INSTRUCTION
      }
    }
  }

  // 2. Gọi dịch vụ mô hình Groq (mô hình openai/gpt-oss-20b) với chỉ dẫn nghiệp vụ thực tế
  const groqApiKey = process.env.GROQ_API_KEY
  if (groqApiKey) {
    try {
      const groqMessages: ChatMessage[] = [
        {
          role: 'system',
          content: `${instructions}\n\nHãy phản hồi bằng tiếng Việt lịch sự, rõ ràng, chính xác và chuyên nghiệp.`,
        },
        ...messages,
      ]

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: groqMessages,
          temperature: 0.7,
          reasoning_format: 'hidden',
        }),
      })

      if (groqResponse.ok) {
        const groqData: unknown = await groqResponse.json()
        if (isGroqCompletionResponse(groqData)) {
          return Response.json(groqData)
        }
      }
    } catch {
      // Kích hoạt phản hồi dự phòng nếu có sự cố kết nối
    }
  }

  // 3. Phản hồi dự phòng đảm bảo người dùng luôn nhận được kết quả
  return buildFallbackResponse(payload.model, userText)
}
