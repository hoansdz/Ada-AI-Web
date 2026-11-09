'use client'

import { FormEvent, useState } from 'react'
import { getAccountFromPayload, saveStoredAccount } from '@/lib/auth-storage'

type AdminLoginFormProps = {
  redirectTarget: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function AdminLoginForm({ redirectTarget }: AdminLoginFormProps) {
  const [email, setEmail] = useState('admin@ada.ai')
  const [password, setPassword] = useState('admin123')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setSubmitting(true)
    setErrorMessage(null)

    try {
      const response = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, next: redirectTarget }),
      })

      if (!response.ok) {
        throw new Error('Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin.')
      }

      const payload: unknown = await response.json()
      const account = getAccountFromPayload(payload)
      if (account) {
        saveStoredAccount(account)
      }

      let destination = redirectTarget
      if (
        isRecord(payload) &&
        typeof payload.redirect === 'string' &&
        payload.redirect.startsWith('/') &&
        !payload.redirect.startsWith('//')
      ) {
        destination = payload.redirect
      }

      window.location.assign(destination)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Đã xảy ra lỗi khi đăng nhập.')
      setSubmitting(false)
    }
  }

  return (
    <form className="admin-test-login-form" onSubmit={(event) => void handleSubmit(event)}>
      {errorMessage && (
        <div className="login-alert login-alert-error" role="alert">
          {errorMessage}
        </div>
      )}
      <input type="hidden" name="next" value={redirectTarget} />
      <div className="admin-test-field">
        <label className="admin-test-label" htmlFor="admin-email">
          Email quản trị
        </label>
        <input
          id="admin-email"
          className="admin-test-input"
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div className="admin-test-field">
        <label className="admin-test-label" htmlFor="admin-password">
          Mật khẩu xác thực
        </label>
        <input
          id="admin-password"
          className="admin-test-input"
          type="password"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="current-password"
        />
      </div>

      <button className="admin-test-submit-btn" type="submit" disabled={submitting}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span>{submitting ? 'Đang xác thực...' : 'Đăng nhập quyền Quản trị viên'}</span>
      </button>
    </form>
  )
}
