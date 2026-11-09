export type AdminAccount = {
  id: string
  email: string
  name: string
  avatar_url: string | null
  api_key_prefix: string
}

export const ADMIN_SESSION_PREFIX = 'ada_admin_sess_'
export const DEFAULT_ADMIN_EMAIL = 'admin@ada.ai'
export const DEFAULT_ADMIN_NAME = 'Quản trị viên hệ thống'
export const DEFAULT_ADMIN_KEY_PREFIX = 'ada_live_adm...****'
export const DEFAULT_ADMIN_INSTRUCTION =
  'Bạn là trợ lý ảo Ada AI, luôn hỗ trợ giải đáp và xử lý công việc một cách chuẩn mực, tận tâm và chuyên nghiệp.'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function createAdminSessionToken(email?: string, name?: string): string {
  const safeEmail = (email && email.trim()) || DEFAULT_ADMIN_EMAIL
  const safeName = (name && name.trim()) || DEFAULT_ADMIN_NAME

  const payload = JSON.stringify({
    id: 'usr_admin_001',
    email: safeEmail,
    name: safeName,
    created_at: Date.now(),
  })

  return `${ADMIN_SESSION_PREFIX}${Buffer.from(payload).toString('base64url')}`
}

export function parseAdminSession(sessionToken: string | null | undefined): AdminAccount | null {
  if (!sessionToken) {
    return null
  }

  let rawBase64 = ''
  if (sessionToken.startsWith(ADMIN_SESSION_PREFIX)) {
    rawBase64 = sessionToken.slice(ADMIN_SESSION_PREFIX.length)
  } else {
    rawBase64 = sessionToken
  }

  if (!rawBase64) {
    return {
      id: 'usr_admin_001',
      email: DEFAULT_ADMIN_EMAIL,
      name: DEFAULT_ADMIN_NAME,
      avatar_url: null,
      api_key_prefix: DEFAULT_ADMIN_KEY_PREFIX,
    }
  }

  try {
    const jsonString = Buffer.from(rawBase64, 'base64url').toString('utf-8')
    const parsed: unknown = JSON.parse(jsonString)

    if (!isRecord(parsed)) {
      return null
    }

    if (isRecord(parsed.user)) {
      const user = parsed.user
      const id = typeof user.id === 'string' && user.id ? user.id : 'usr_admin_001'
      const email = typeof user.email === 'string' && user.email ? user.email : DEFAULT_ADMIN_EMAIL
      const name = typeof user.name === 'string' && user.name ? user.name : DEFAULT_ADMIN_NAME

      return {
        id,
        email,
        name,
        avatar_url: null,
        api_key_prefix: DEFAULT_ADMIN_KEY_PREFIX,
      }
    }

    if (typeof parsed.email === 'string' || typeof parsed.id === 'string') {
      const id = typeof parsed.id === 'string' && parsed.id ? parsed.id : 'usr_admin_001'
      const email = typeof parsed.email === 'string' && parsed.email ? parsed.email : DEFAULT_ADMIN_EMAIL
      const name = typeof parsed.name === 'string' && parsed.name ? parsed.name : DEFAULT_ADMIN_NAME

      return {
        id,
        email,
        name,
        avatar_url: null,
        api_key_prefix: DEFAULT_ADMIN_KEY_PREFIX,
      }
    }

    return null
  } catch {
    return sessionToken.startsWith(ADMIN_SESSION_PREFIX)
      ? {
          id: 'usr_admin_001',
          email: DEFAULT_ADMIN_EMAIL,
          name: DEFAULT_ADMIN_NAME,
          avatar_url: null,
          api_key_prefix: DEFAULT_ADMIN_KEY_PREFIX,
        }
      : null
  }
}
