import { API_BASE_URL } from '@/lib/api'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url)
  const next = requestUrl.searchParams.get('next')
  const callbackUrl = new URL('/api/auth/google/callback', request.url).toString()
  const state = crypto.randomUUID()
  const authorizationUrl = new URL('/v1/auth/google/authorize', API_BASE_URL)
  authorizationUrl.searchParams.set('redirect_uri', callbackUrl)
  authorizationUrl.searchParams.set('state', state)

  try {
    const backendResponse = await fetch(authorizationUrl, { redirect: 'manual' })
    const location = backendResponse.headers.get('location')

    if (backendResponse.status < 300 || backendResponse.status >= 400 || !location) {
      return NextResponse.redirect(new URL('/login?error=backend', request.url))
    }

    const response = NextResponse.redirect(location)
    response.cookies.set('ada_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google/callback',
      maxAge: 600,
    })
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      response.cookies.set('ada_auth_next', next, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 600,
      })
    }
    return response
  } catch {
    return NextResponse.redirect(new URL('/login?error=backend', request.url))
  }
}
