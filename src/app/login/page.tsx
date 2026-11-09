import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { AdminLoginForm } from './AdminLoginForm'

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error, next } = await searchParams
  const redirectTarget = next && next.startsWith('/') && !next.startsWith('//') ? next : '/chat'

  if (!error) {
    const cookieStore = await cookies()
    const session = cookieStore.get('ada_session')?.value
    if (session) {
      redirect(redirectTarget)
    }
  }

  return (
    <div className="login-page-container">
      <div className="login-card-modern">
        <div className="login-card-header">
          <a className="login-brand-logo" href="/" aria-label="Trang chủ Ada AI">
            <span className="brand-logo-text">Ada<strong>AI</strong></span>
          </a>
          <h1 className="login-title">Đăng nhập tài khoản</h1>
          <p className="login-subtitle">
            Đăng nhập bằng tài khoản Google hoặc tài khoản Quản trị viên để quản lý trợ lý và đồng bộ dữ liệu.
          </p>
        </div>

        {error === 'oauth' && (
          <div className="login-alert login-alert-error" role="alert">
            Không thể hoàn tất xác thực với Google. Vui lòng thử lại sau.
          </div>
        )}
        {error === 'backend' && (
          <div className="login-alert login-alert-error" role="alert">
            Hệ thống tạm thời không phản hồi. Vui lòng thử lại sau ít phút.
          </div>
        )}

        <div className="login-actions">
          <a className="google-auth-button" href={`/api/auth/google?next=${encodeURIComponent(redirectTarget)}`}>
            <svg className="google-auth-icon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Tiếp tục với Google</span>
          </a>
        </div>

        <div className="login-divider-with-text">
          <span>hoặc đăng nhập bằng tài khoản quản trị</span>
        </div>

        <AdminLoginForm redirectTarget={redirectTarget} />

        <div className="login-divider-line" />

        <div className="login-footer-links">
          <a className="login-back-link" href="/">
            Quay lại trang chủ
          </a>
        </div>

        <p className="login-terms-note">
          Tài khoản và thông tin xác thực quản trị được ghi nhận và bảo vệ an toàn trên hệ thống.
        </p>
      </div>
    </div>
  )
}
