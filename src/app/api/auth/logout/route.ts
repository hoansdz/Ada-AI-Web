import { proxyRequest } from '@/lib/api'
import { parseAdminSession } from '@/lib/mock-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function createClearedSessionResponse(): NextResponse {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('ada_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  response.cookies.set('ada_admin_instructions', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}

export async function POST(request: NextRequest): Promise<Response> {
  const session = request.cookies.get('ada_session')?.value
  if (!session) {
    return createClearedSessionResponse()
  }

  if (parseAdminSession(session)) {
    return createClearedSessionResponse()
  }

  try {
    await proxyRequest('/v1/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session}` },
      body: JSON.stringify({}),
    })
  } catch {
    // Nếu backend không phản hồi, vẫn xóa phiên trên trình duyệt
  }

  return createClearedSessionResponse()
}

export async function GET(): Promise<Response> {
  return createClearedSessionResponse()
}
