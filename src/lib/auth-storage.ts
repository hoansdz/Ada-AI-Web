export type Account = {
  id: string
  email: string
  name: string
  avatar_url: string | null
  api_key_prefix: string
}

const ACCOUNT_STORAGE_KEY = 'ada_user_account'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isAccount(value: unknown): value is Account {
  if (!isRecord(value)) {
    return false
  }

  const hasValidAvatar = typeof value.avatar_url === 'string' || value.avatar_url === null

  return (
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    typeof value.name === 'string' &&
    hasValidAvatar &&
    typeof value.api_key_prefix === 'string'
  )
}

export function getAccountFromPayload(value: unknown): Account | null {
  if (!isRecord(value)) {
    return null
  }

  const user = isRecord(value.user) ? value.user : value
  if (!isRecord(user)) {
    return null
  }

  const id = typeof user.id === 'string' ? user.id : ''
  const email = typeof user.email === 'string' ? user.email : ''
  const name = typeof user.name === 'string' ? user.name : ''
  const avatarUrl =
    typeof user.avatar_url === 'string'
      ? user.avatar_url
      : typeof user.picture === 'string'
        ? user.picture
        : null
  const apiKeyPrefix = typeof user.api_key_prefix === 'string' ? user.api_key_prefix : ''

  if (!id || !email || !name) {
    return null
  }

  return {
    id,
    email,
    name,
    avatar_url: avatarUrl,
    api_key_prefix: apiKeyPrefix,
  }
}

export function loadStoredAccount(): Account | null {
  if (typeof window === 'undefined') {
    return null
  }
  try {
    const raw = localStorage.getItem(ACCOUNT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (isAccount(parsed)) {
      return parsed
    }
  } catch {
    // Không thể đọc thông tin tài khoản từ bộ nhớ trình duyệt
  }
  return null
}

export function saveStoredAccount(account: Account): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account))
  } catch {
    // Không thể ghi thông tin tài khoản vào bộ nhớ trình duyệt
  }
}

export function clearStoredAccount(): void {
  if (typeof window === 'undefined') {
    return
  }
  try {
    localStorage.removeItem(ACCOUNT_STORAGE_KEY)
  } catch {
    // Không thể xóa thông tin tài khoản khỏi bộ nhớ trình duyệt
  }
}
