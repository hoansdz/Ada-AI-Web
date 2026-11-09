import { proxyRequest } from '@/lib/api'
import { DEFAULT_ADMIN_INSTRUCTION, parseAdminSession } from '@/lib/mock-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getSession(request: NextRequest): string | null {
  return request.cookies.get('ada_session')?.value ?? null
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = getSession(request)

  if (session && !parseAdminSession(session)) {
    try {
      const backendResponse = await proxyRequest('/v1/me/agent', {
        headers: { Authorization: `Bearer ${session}` },
        cache: 'no-store',
      })

      if (backendResponse.ok) {
        const payload: unknown = await backendResponse.json()
        if (isRecord(payload)) {
          const instructions =
            typeof payload.instructions === 'string'
              ? payload.instructions
              : typeof payload.system_prompt === 'string'
                ? payload.system_prompt
                : DEFAULT_ADMIN_INSTRUCTION
          return NextResponse.json({ instructions })
        }
      }
    } catch {
      // Backend tạm gián đoạn, sử dụng giá trị đã lưu
    }
  }

  const rawSaved = request.cookies.get('ada_admin_instructions')?.value
  let instructions = DEFAULT_ADMIN_INSTRUCTION
  if (rawSaved) {
    try {
      instructions = decodeURIComponent(rawSaved)
    } catch {
      instructions = DEFAULT_ADMIN_INSTRUCTION
    }
  }

  return NextResponse.json({ instructions })
}

export async function PUT(request: NextRequest): Promise<Response> {
  const session = getSession(request)

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json(
      { error: { message: 'Nội dung yêu cầu phải là JSON hợp lệ.' } },
      { status: 400 }
    )
  }

  if (
    !isRecord(payload) ||
    typeof payload.instructions !== 'string' ||
    payload.instructions.length > 12000
  ) {
    return NextResponse.json(
      { error: { message: 'Chỉ dẫn Agent phải là văn bản không quá 12.000 ký tự.' } },
      { status: 400 }
    )
  }

  if (session && !parseAdminSession(session)) {
    try {
      const backendResponse = await proxyRequest('/v1/me/agent', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${session}` },
        body: JSON.stringify({ system_prompt: payload.instructions }),
        cache: 'no-store',
      })

      if (backendResponse.ok) {
        const response = NextResponse.json({ instructions: payload.instructions })
        response.cookies.set('ada_admin_instructions', encodeURIComponent(payload.instructions), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
          maxAge: 60 * 60 * 24 * 7,
        })
        return response
      }
    } catch {
      // Tiếp tục lưu vào cookie nếu backend tạm không khả dụng
    }
  }

  const response = NextResponse.json({ instructions: payload.instructions })
  response.cookies.set('ada_admin_instructions', encodeURIComponent(payload.instructions), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}
