import { proxyRequest } from '@/lib/api'
import {
  DEFAULT_ADMIN_INSTRUCTION,
  parseAdminSession,
} from '@/lib/mock-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export async function GET(request: NextRequest): Promise<Response> {
  const session = request.cookies.get('ada_session')?.value

  if (!session) {
    return NextResponse.json(
      { authenticated: false, user: null, error: { message: 'Chưa đăng nhập.' } },
      { status: 401 }
    )
  }

  // 1. Kiểm tra nếu là phiên quản trị viên
  const adminAccount = parseAdminSession(session)
  if (adminAccount) {
    return NextResponse.json({
      authenticated: true,
      user: adminAccount,
      agent: {
        model: 'openai/gpt-oss-20b',
        system_prompt: DEFAULT_ADMIN_INSTRUCTION,
        updated_at: new Date().toISOString(),
      },
      rate_limit: {
        requests_per_minute: 60,
        requests_per_hour: 1000,
        requests_per_day: 10000,
        monthly_quota: 100000,
        used_this_month: 0,
        remaining_monthly: 100000,
      },
    })
  }

  // 2. Phiên thông thường kết nối với Control Plane
  try {
    const backendResponse = await proxyRequest('/v1/me', {
      headers: { Authorization: `Bearer ${session}` },
      cache: 'no-store',
    })

    if (backendResponse.ok) {
      const payload: unknown = await backendResponse.json()
      if (isRecord(payload) && isRecord(payload.user)) {
        const user = payload.user
        const avatarUrl =
          typeof user.avatar_url === 'string' && user.avatar_url
            ? user.avatar_url
            : typeof user.picture === 'string' && user.picture
              ? user.picture
              : null

        const normalizedUser = {
          ...user,
          avatar_url: avatarUrl,
        }

        return NextResponse.json({
          ...payload,
          authenticated: true,
          user: normalizedUser,
        })
      }
    }

    if (backendResponse.status === 401 || backendResponse.status === 403) {
      const response = NextResponse.json(
        { authenticated: false, user: null, error: { message: 'Phiên đăng nhập đã hết hạn.' } },
        { status: 401 }
      )
      response.cookies.set('ada_session', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      })
      return response
    }
  } catch {
    // Backend tạm gián đoạn, sử dụng thông tin phiên đã cấp phát
    return NextResponse.json(
      { authenticated: false, user: null, error: { message: 'Máy chủ xác thực tạm thời không phản hồi.' } },
      { status: 503 }
    )
  }

  return NextResponse.json(
    { authenticated: false, user: null, error: { message: 'Phiên không hợp lệ.' } },
    { status: 401 }
  )
}
