import { proxyRequest } from '@/lib/api'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

type SessionExchange = {
  session_token: string
  expires_in: number
  user: {
    id: string
    email: string
    name: string
    avatar_url: string | null
    api_key_prefix: string
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSessionExchange(value: unknown): value is SessionExchange {
  if (!isRecord(value) || !isRecord(value.user)) {
    return false
  }

  const user = value.user
  return (
    typeof value.session_token === 'string' &&
    value.session_token.length > 0 &&
    typeof value.expires_in === 'number' &&
    value.expires_in > 0 &&
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.name === 'string' &&
    (typeof user.avatar_url === 'string' || user.avatar_url === null) &&
    typeof user.api_key_prefix === 'string'
  )
}

export async function GET(request: NextRequest): Promise<Response> {
  const stateCookie = request.cookies.get('ada_oauth_state')?.value
  const stateParameter = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')

  if (!stateCookie || stateCookie !== stateParameter || !code) {
    return NextResponse.redirect(new URL('/login?error=oauth', request.url))
  }

  const callbackUrl = new URL('/api/auth/google/callback', request.url).toString()
  let exchangeResponse: Response
  try {
    exchangeResponse = await proxyRequest('/v1/auth/google/exchange', {
      method: 'POST',
      body: JSON.stringify({ code, redirect_uri: callbackUrl }),
    })
  } catch {
    return NextResponse.redirect(new URL('/login?error=backend', request.url))
  }

  if (!exchangeResponse.ok) {
    return NextResponse.redirect(new URL('/login?error=backend', request.url))
  }

  const payload: unknown = await exchangeResponse.json()
  if (!isSessionExchange(payload)) {
    return NextResponse.json(
      { error: { message: 'Backend trả về thông tin phiên đăng nhập không hợp lệ.' } },
      { status: 502 }
    )
  }

  const nextTarget = request.cookies.get('ada_auth_next')?.value
  const redirectPath =
    nextTarget && nextTarget.startsWith('/') && !nextTarget.startsWith('//')
      ? nextTarget
      : '/chat'

  const response = NextResponse.redirect(new URL(redirectPath, request.url))
  response.cookies.set('ada_session', payload.session_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: payload.expires_in,
  })
  response.cookies.set('ada_oauth_state', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google/callback',
    maxAge: 0,
  })
  response.cookies.set('ada_auth_next', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return response
}
