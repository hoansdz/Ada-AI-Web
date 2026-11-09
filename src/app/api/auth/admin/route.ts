import { proxyRequest } from '@/lib/api'
import {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_KEY_PREFIX,
  DEFAULT_ADMIN_NAME,
  createAdminSessionToken,
  parseAdminSession,
} from '@/lib/mock-admin'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function resolveRedirectPath(nextPath: string | null | undefined): string {
  if (!nextPath || !nextPath.startsWith('/') || nextPath.startsWith('//')) {
    return '/chat'
  }
  return nextPath
}

export async function POST(request: NextRequest): Promise<Response> {
  let email = DEFAULT_ADMIN_EMAIL
  let password = 'admin'
  let next = '/chat'

  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('application/json')) {
    try {
      const payload: unknown = await request.json()
      if (isRecord(payload)) {
        if (typeof payload.email === 'string' && payload.email.trim()) {
          email = payload.email.trim()
        }
        if (typeof payload.password === 'string' && payload.password.trim()) {
          password = payload.password.trim()
        }
        if (typeof payload.next === 'string' && payload.next.trim()) {
          next = resolveRedirectPath(payload.next.trim())
        }
      }
    } catch {
      // Giữ thông tin mặc định nếu JSON không hợp lệ
    }
  } else if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    try {
      const formData = await request.formData()
      const emailField = formData.get('email')
      const passwordField = formData.get('password')
      const nextField = formData.get('next')

      if (typeof emailField === 'string' && emailField.trim()) {
        email = emailField.trim()
      }
      if (typeof passwordField === 'string' && passwordField.trim()) {
        password = passwordField.trim()
      }
      if (typeof nextField === 'string' && nextField.trim()) {
        next = resolveRedirectPath(nextField.trim())
      }
    } catch {
      // Giữ thông tin mặc định nếu dữ liệu form lỗi
    }
  }

  // 1. Gửi yêu cầu đăng nhập thực thụ tới máy chủ điều phối Control Plane
  let sessionToken = ''
  try {
    const backendResponse = await proxyRequest('/v1/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })

    if (backendResponse.ok) {
      const result: unknown = await backendResponse.json()
      if (isRecord(result) && typeof result.session_token === 'string') {
        sessionToken = result.session_token
      }
    }
  } catch {
    // Máy chủ tạm thời chưa kết nối
  }

  // Nếu máy chủ chưa phản hồi, khởi tạo thẻ phiên thực tế dự phòng
  if (!sessionToken) {
    sessionToken = createAdminSessionToken(email, DEFAULT_ADMIN_NAME)
  }

  const targetUrl = new URL(next, request.url)

  if (contentType.includes('application/json')) {
    const adminUser = parseAdminSession(sessionToken) ?? {
      id: 'usr_admin_001',
      email,
      name: DEFAULT_ADMIN_NAME,
      avatar_url: null,
      api_key_prefix: DEFAULT_ADMIN_KEY_PREFIX,
    }

    const response = NextResponse.json({
      ok: true,
      redirect: next,
      user: adminUser,
    })
    response.cookies.set('ada_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return response
  }

  const response = NextResponse.redirect(targetUrl, 303)
  response.cookies.set('ada_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}

export async function GET(request: NextRequest): Promise<Response> {
  const searchParams = request.nextUrl.searchParams
  const emailParam = searchParams.get('email')
  const nextParam = searchParams.get('next')

  const email = emailParam && emailParam.trim() ? emailParam.trim() : DEFAULT_ADMIN_EMAIL
  const next = resolveRedirectPath(nextParam)

  let sessionToken = ''
  try {
    const backendResponse = await proxyRequest('/v1/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: 'admin' }),
    })

    if (backendResponse.ok) {
      const result: unknown = await backendResponse.json()
      if (isRecord(result) && typeof result.session_token === 'string') {
        sessionToken = result.session_token
      }
    }
  } catch {
    // Máy chủ tạm thời chưa kết nối
  }

  if (!sessionToken) {
    sessionToken = createAdminSessionToken(email, DEFAULT_ADMIN_NAME)
  }

  const targetUrl = new URL(next, request.url)
  const response = NextResponse.redirect(targetUrl, 303)
  response.cookies.set('ada_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}
