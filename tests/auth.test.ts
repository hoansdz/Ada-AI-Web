import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  createAdminSessionToken,
  parseAdminSession,
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_NAME,
  ADMIN_SESSION_PREFIX,
} from '../src/lib/mock-admin'
import { GET as getMe } from '../src/app/api/auth/me/route'
import { POST as postLogout } from '../src/app/api/auth/logout/route'
import { POST as postAdminLogin } from '../src/app/api/auth/admin/route'
import { NextRequest } from 'next/server'

describe('Authentication State & Session Management Tests', () => {
  test('Tạo và giải mã thẻ phiên quản trị viên chính xác', () => {
    const token = createAdminSessionToken('admin@ada.ai', 'Quản trị viên')
    assert.ok(token.startsWith(ADMIN_SESSION_PREFIX), 'Token phải có tiền tố quản trị')

    const account = parseAdminSession(token)
    assert.ok(account !== null, 'Phải giải mã được tài khoản quản trị')
    assert.strictEqual(account.email, 'admin@ada.ai')
    assert.strictEqual(account.name, 'Quản trị viên')
  })

  test('Từ chối giải mã phiên rỗng hoặc phiên không hợp lệ', () => {
    assert.strictEqual(parseAdminSession(null), null)
    assert.strictEqual(parseAdminSession(''), null)
    assert.strictEqual(parseAdminSession('invalid_token_string'), null)
  })

  test('GET /api/auth/me trả về HTTP 401 khi không có phiên đăng nhập', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/me')
    const response = await getMe(request)

    assert.strictEqual(response.status, 401, 'Chưa đăng nhập phải trả về mã 401')
    const body: unknown = await response.json()
    assert.ok(typeof body === 'object' && body !== null)
    const record = body as Record<string, unknown>
    assert.strictEqual(record.authenticated, false)
    assert.strictEqual(record.user, null)
  })

  test('GET /api/auth/me trả về thông tin quản trị khi có thẻ phiên quản trị', async () => {
    const adminToken = createAdminSessionToken(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME)
    const request = new NextRequest('http://localhost:3000/api/auth/me', {
      headers: {
        cookie: `ada_session=${adminToken}`,
      },
    })
    const response = await getMe(request)

    assert.strictEqual(response.status, 200, 'Phiên quản trị phải trả về mã 200')
    const body: unknown = await response.json()
    assert.ok(typeof body === 'object' && body !== null)
    const record = body as Record<string, unknown>
    assert.strictEqual(record.authenticated, true)
    assert.ok(typeof record.user === 'object' && record.user !== null)
    const user = record.user as Record<string, unknown>
    assert.strictEqual(user.email, DEFAULT_ADMIN_EMAIL)
  })

  test('POST /api/auth/logout xóa thẻ phiên trên trình duyệt', async () => {
    const adminToken = createAdminSessionToken(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_NAME)
    const request = new NextRequest('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        cookie: `ada_session=${adminToken}`,
      },
    })
    const response = await postLogout(request)

    assert.strictEqual(response.status, 200)
    const setCookie = response.headers.get('set-cookie') ?? ''
    assert.ok(setCookie.includes('ada_session='), 'Phải thiết lập cookie ada_session')
    assert.ok(setCookie.includes('Max-Age=0'), 'Cookie ada_session phải hết hạn ngay')
  })

  test('POST /api/auth/admin cấp phát thẻ phiên hợp lệ', async () => {
    const request = new NextRequest('http://localhost:3000/api/auth/admin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test_admin@ada.ai',
        password: 'admin',
        next: '/chat',
      }),
    })
    const response = await postAdminLogin(request)

    assert.strictEqual(response.status, 200)
    const setCookie = response.headers.get('set-cookie') ?? ''
    assert.ok(setCookie.includes('ada_session='), 'Phải thiết lập cookie phiên')
  })
})
