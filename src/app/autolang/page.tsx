'use client'

import React, { FormEvent, KeyboardEvent, useEffect, useRef, useState, MouseEvent } from 'react'
import {
  Account,
  clearStoredAccount,
  getAccountFromPayload,
  loadStoredAccount,
  saveStoredAccount,
} from '@/lib/auth-storage'

interface ToolCall {
  tool: string
  args: unknown[]
  result: unknown
  ms: number
  effect: boolean
  error?: string
}

interface RunResult {
  status: string
  stdout: string
  error: string | null
  tool_calls: ToolCall[]
  ms: number
}

interface Attempt {
  code: string
  compile_error?: string
  tokens?: number
  duration_ms?: number
}

interface TaskRecord {
  id: string
  conversation_id: string
  text: string
  toolpack: string | null
  run: boolean
  status: string
  created_at: string
  updated_at: string
  generation_ms?: number
  run_ms?: number
  http_status?: number
  code?: string
  attempts?: Attempt[]
  refusal?: {
    code: string
    message: string
  }
  run_result?: RunResult
  error?: string | null
}

interface ConversationItem {
  id: string
  title: string
  updated_at: string
  task_count: number
}

interface Suggestion {
  title: string
  prompt: string
}

const autolangSuggestions: Suggestion[] = [
  {
    title: 'Đếm đơn đang giao',
    prompt: 'Đếm số lượng đơn hàng đang có trạng thái vận chuyển shipping',
  },
  {
    title: 'Tìm kiếm sản phẩm',
    prompt: 'Tìm kiếm các sản phẩm có từ khóa áo trong kho hàng',
  },
  {
    title: 'Danh sách đơn hàng',
    prompt: 'Liệt kê danh sách các đơn hàng đang giao kèm mã khách hàng',
  },
  {
    title: 'Thông báo khách hàng',
    prompt: 'Gửi tin nhắn Zalo thông báo đơn hàng cho khách hàng C001',
  },
]

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  queued: { label: 'Đang chờ xử lý', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
  generating: { label: 'Đang tạo mã chương trình', bg: '#eff6ff', color: '#1d4ed8', border: '#93c5fd' },
  running: { label: 'Đang thực thi mã', bg: '#fef3c7', color: '#b45309', border: '#fcd34d' },
  done: { label: 'Hoàn thành', bg: '#ecfdf5', color: '#047857', border: '#6ee7b7' },
  refused: { label: 'Từ chối thực hiện', bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  compile_error: { label: 'Lỗi biên dịch', bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  runtime_error: { label: 'Lỗi thực thi', bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  timeout: { label: 'Quá thời gian quy định', bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  tools_mismatch: { label: 'Lệch khai báo công cụ', bg: '#fdf4ff', color: '#86198f', border: '#f0abfc' },
  adaai_unreachable: { label: 'Dịch vụ tạm gián đoạn', bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  adaai_error: { label: 'Lỗi phản hồi hệ thống', bg: '#fef2f2', color: '#b91c1c', border: '#fca5a5' },
  interrupted: { label: 'Bị gián đoạn', bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
}

function parseJsonForTable(raw: string): { isJson: boolean; rows: Record<string, unknown>[] } {
  try {
    const trimmed = raw.trim()
    if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
      return { isJson: false, rows: [] }
    }
    const parsed: unknown = JSON.parse(trimmed)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
      return { isJson: true, rows: parsed as Record<string, unknown>[] }
    }
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return { isJson: true, rows: [parsed as Record<string, unknown>] }
    }
    return { isJson: false, rows: [] }
  } catch {
    return { isJson: false, rows: [] }
  }
}

export default function AutoLangPage() {
  const [currentConversationId, setCurrentConversationId] = useState<string>(() =>
    `autolang_conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  )
  const [conversations, setConversations] = useState<ConversationItem[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [draft, setDraft] = useState('')
  const [selectedToolpack, setSelectedToolpack] = useState('shop')
  const [autoRun, setAutoRun] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [viewingCode, setViewingCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [adaaiUp, setAdaaiUp] = useState<boolean | null>(null)

  const [account, setAccount] = useState<Account | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const taskListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cached = loadStoredAccount()
    if (cached) {
      setAccount(cached)
      setAuthLoading(false)
    }

    const controller = new AbortController()
    async function syncAccount(): Promise<void> {
      try {
        const response = await fetch('/api/auth/me', { signal: controller.signal })
        if (response.status === 401) {
          setAccount(null)
          clearStoredAccount()
        } else if (response.ok) {
          const payload: unknown = await response.json()
          const loaded = getAccountFromPayload(payload)
          if (loaded) {
            setAccount(loaded)
            saveStoredAccount(loaded)
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
      } finally {
        if (!controller.signal.aborted) {
          setAuthLoading(false)
        }
      }
    }

    void syncAccount()
    return () => controller.abort()
  }, [])

  async function signOut(): Promise<void> {
    try {
      clearStoredAccount()
      setAccount(null)
      await fetch('/api/auth/logout', { method: 'POST' })
      window.location.assign('/login')
    } catch {
      window.location.assign('/login')
    }
  }

  // Kiểm tra sức khỏe dịch vụ
  useEffect(() => {
    async function checkHealth(): Promise<void> {
      try {
        const res = await fetch('/api/health')
        if (res.ok) {
          const data: unknown = await res.json()
          if (typeof data === 'object' && data !== null && 'adaai' in data) {
            setAdaaiUp((data as { adaai: string }).adaai === 'up')
            return
          }
        }
        setAdaaiUp(false)
      } catch {
        setAdaaiUp(false)
      }
    }
    void checkHealth()
    const interval = setInterval(checkHealth, 15000)
    return () => clearInterval(interval)
  }, [])

  // Nạp danh sách cuộc hội thoại
  const loadConversations = async (): Promise<void> => {
    try {
      const res = await fetch('/api/conversations')
      if (res.ok) {
        const data: unknown = await res.json()
        if (typeof data === 'object' && data !== null && 'conversations' in data) {
          const list = (data as { conversations: ConversationItem[] }).conversations
          setConversations(list)
        }
      }
    } catch {
      // Giữ danh sách hiện có nếu mạng gián đoạn
    }
  }

  useEffect(() => {
    void loadConversations()
  }, [])

  // Nạp danh sách tác vụ của cuộc hội thoại hiện tại
  const loadTasks = async (convId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/tasks?conversation_id=${encodeURIComponent(convId)}`)
      if (res.ok) {
        const data: unknown = await res.json()
        if (typeof data === 'object' && data !== null && 'tasks' in data) {
          const list = (data as { tasks: TaskRecord[] }).tasks
          setTasks(list)
        }
      }
    } catch {
      // Bỏ qua lỗi kết nối
    }
  }

  useEffect(() => {
    void loadTasks(currentConversationId)
  }, [currentConversationId])

  // Tự động cuộn xuống đáy khi có tác vụ mới
  useEffect(() => {
    taskListRef.current?.scrollTo({
      top: taskListRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [tasks])

  // Polling cập nhật tác vụ đang xử lý
  useEffect(() => {
    const hasPendingTask = tasks.some(
      (t) => t.status === 'queued' || t.status === 'generating' || t.status === 'running'
    )
    if (!hasPendingTask) {
      return
    }

    const timer = setInterval(() => {
      void loadTasks(currentConversationId)
      void loadConversations()
    }, 1500)

    return () => clearInterval(timer)
  }, [tasks, currentConversationId])

  const startNewConversation = (): void => {
    const newId = `autolang_conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    setCurrentConversationId(newId)
    setTasks([])
    setDraft('')
    setErrorMessage(null)
    textareaRef.current?.focus()
  }

  const selectConversation = (conv: ConversationItem): void => {
    setCurrentConversationId(conv.id)
    setErrorMessage(null)
    if (window.innerWidth <= 860) {
      setSidebarOpen(false)
    }
  }

  const deleteConversation = async (convId: string, event: MouseEvent): Promise<void> => {
    event.stopPropagation()
    try {
      const res = await fetch(`/api/conversations/${encodeURIComponent(convId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data: unknown = await res.json()
        const errMsg = typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error: string }).error)
          : 'Không thể xóa cuộc trò chuyện'
        setErrorMessage(errMsg)
        return
      }

      setConversations((prev) => prev.filter((item) => item.id !== convId))
      if (currentConversationId === convId) {
        startNewConversation()
      }
    } catch {
      setErrorMessage('Lỗi khi gửi yêu cầu xóa cuộc trò chuyện')
    }
  }

  const submitTask = async (customPrompt?: string): Promise<void> => {
    const text = (customPrompt ?? draft).trim()
    if (!text || submitting) {
      return
    }

    setSubmitting(true)
    setDraft('')
    setErrorMessage(null)

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: currentConversationId,
          text,
          toolpack: selectedToolpack,
          run: autoRun,
        }),
      })

      if (!res.ok) {
        const data: unknown = await res.json()
        const errMsg = typeof data === 'object' && data !== null && 'error' in data
          ? String((data as { error: string }).error)
          : 'Gửi tác vụ thất bại'
        throw new Error(errMsg)
      }

      const createdTask = (await res.json()) as TaskRecord
      setTasks((prev) => [...prev, createdTask])
      void loadConversations()
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Lỗi khi gửi tác vụ')
    } finally {
      setSubmitting(false)
      textareaRef.current?.focus()
    }
  }

  const retryTask = async (taskId: string): Promise<void> => {
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/retry`, {
        method: 'POST',
      })
      if (res.ok) {
        void loadTasks(currentConversationId)
      }
    } catch {
      setErrorMessage('Không thể thử lại tác vụ')
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submitTask()
    }
  }

  const copyCodeToClipboard = (code: string): void => {
    void navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  return (
    <div className="chat-app-root">
      {sidebarOpen && (
        <button
          className="chat-sidebar-backdrop"
          type="button"
          aria-label="Đóng thanh điều hướng"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {sidebarOpen && (
        <aside className="chat-sidebar">
          <div className="chat-sidebar-header">
            <a className="sidebar-brand-link" href="/autolang" aria-label="AutoLang AI">
              <span className="brand-logo-text">AutoLang<strong>AI</strong></span>
            </a>
            <button
              className="chat-icon-btn"
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Thu gọn thanh bên"
              title="Thu gọn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M9 3v18" />
              </svg>
            </button>
          </div>

          <div className="chat-sidebar-action">
            <button className="chat-new-btn" type="button" onClick={startNewConversation}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Tác vụ AutoLang mới</span>
            </button>
          </div>

          <nav className="chat-nav-menu" aria-label="Chuyển đổi trợ lý">
            <a className="chat-nav-item" href="/chat">
              Trò chuyện Ada AI
            </a>
            <a className="chat-nav-item active" href="/autolang">
              AutoLang AI (Độc lập)
            </a>
            {!account && !authLoading && (
              <a className="chat-nav-item" href="/login">
                Tài khoản & Đăng nhập
              </a>
            )}
          </nav>

          <div className="chat-sidebar-section">
            <span className="chat-section-label">Lịch sử tác vụ AutoLang</span>
            <div className="chat-history-list">
              {conversations.length === 0 ? (
                <p className="chat-history-note">
                  {tasks.length > 0 ? 'Phiên tác vụ hiện tại' : 'Chưa có lịch sử tác vụ AutoLang.'}
                </p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`chat-history-item ${conv.id === currentConversationId ? 'active' : ''}`}
                    onClick={() => selectConversation(conv)}
                  >
                    <button className="chat-history-btn" type="button">
                      <span className="chat-history-title">{conv.title}</span>
                    </button>
                    <button
                      className="chat-history-remove-btn"
                      type="button"
                      aria-label="Xóa cuộc trò chuyện"
                      onClick={(event) => void deleteConversation(conv.id, event)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="chat-sidebar-footer">
            {account ? (
              <div className="chat-user-profile">
                <div className="user-profile-info">
                  {account.avatar_url ? (
                    <img className="user-avatar-img" src={account.avatar_url} alt="" />
                  ) : (
                    <div className="user-avatar-placeholder">
                      {account.name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="user-details">
                    <span className="user-name">{account.name}</span>
                    <span className="user-email">{account.email}</span>
                  </div>
                </div>
                <button
                  className="chat-icon-btn user-signout-btn"
                  type="button"
                  onClick={() => void signOut()}
                  aria-label="Đăng xuất"
                  title="Đăng xuất"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="chat-user-profile">
                <div className="user-profile-info">
                  <div className="user-avatar-placeholder">AL</div>
                  <div className="user-details">
                    <span className="user-name">Động cơ AutoLang VM</span>
                    <span className="user-email">autolang-compiler (v0.0.31)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      <div className="chat-main-area">
        <header className="chat-topbar">
          <div className="chat-topbar-left">
            {!sidebarOpen && (
              <button
                className="chat-icon-btn"
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Mở thanh bên"
                title="Mở menu"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            )}
            <div className="chat-model-badge">AutoLang AI · Trình biên dịch VM</div>
            <div
              style={{
                fontSize: '12px',
                padding: '3px 8px',
                borderRadius: '6px',
                backgroundColor: adaaiUp ? '#ecfdf5' : '#eff6ff',
                color: adaaiUp ? '#047857' : '#1d4ed8',
                border: `1px solid ${adaaiUp ? '#6ee7b7' : '#93c5fd'}`,
                fontWeight: 500,
              }}
            >
              {adaaiUp ? 'AdaAI Engine: Trực tuyến' : 'Compiler cục bộ: Sẵn sàng'}
            </div>
          </div>

          <div className="chat-topbar-right" style={{ gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
              <label htmlFor="toolpack-select" style={{ color: 'var(--text-secondary)' }}>
                Bộ công cụ:
              </label>
              <select
                id="toolpack-select"
                value={selectedToolpack}
                onChange={(e) => setSelectedToolpack(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-strong)',
                  backgroundColor: 'var(--bg-surface)',
                  fontSize: '13px',
                }}
              >
                <option value="shop">Cửa hàng & Đơn hàng (shop)</option>
              </select>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={autoRun}
                onChange={(e) => setAutoRun(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <span>Tự động chạy mã</span>
            </label>

            <a
              href="/chat"
              className="chat-topbar-link"
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid var(--border-strong)' }}
            >
              Chuyển sang Ada AI
            </a>
          </div>
        </header>

        <div className="chat-body-layout">
          <section className="chat-conversation-panel">
            {tasks.length === 0 ? (
              <div className="chat-welcome-container">
                <div className="welcome-header-box">
                  <h1 className="welcome-main-title">AutoLang AI</h1>
                  <p className="welcome-main-desc">
                    Trợ lý tác tử lập trình chuyên dụng. Nhập tác vụ để hệ thống sinh mã AutoLang,
                    biên dịch bằng compiler và thực thi an toàn trong môi trường ảo VM.
                  </p>
                </div>

                <div className="welcome-suggestions-grid">
                  {autolangSuggestions.map((suggestion) => (
                    <button
                      className="suggestion-action-card"
                      key={suggestion.title}
                      type="button"
                      onClick={() => void submitTask(suggestion.prompt)}
                    >
                      <span className="suggestion-action-title">{suggestion.title}</span>
                      <span className="suggestion-action-desc">{suggestion.prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="chat-messages-container" ref={taskListRef}>
                <div className="chat-messages-inner" style={{ maxWidth: '880px', margin: '0 auto' }}>
                  {tasks.map((task) => {
                    const statusInfo = STATUS_CONFIG[task.status] || {
                      label: task.status,
                      bg: '#f1f5f9',
                      color: '#475569',
                      border: '#cbd5e1',
                    }

                    const tableData = task.run_result?.stdout
                      ? parseJsonForTable(task.run_result.stdout)
                      : { isJson: false, rows: [] }

                    return (
                      <div
                        key={task.id}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '12px',
                          marginBottom: '24px',
                          border: '1px solid var(--border-subtle)',
                          borderRadius: '12px',
                          backgroundColor: 'var(--bg-surface)',
                          padding: '16px 20px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        {/* Tiêu đề yêu cầu người dùng */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span
                              style={{
                                fontWeight: 600,
                                fontSize: '15px',
                                color: 'var(--text-primary)',
                              }}
                            >
                              {task.text}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: '12px',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              backgroundColor: statusInfo.bg,
                              color: statusInfo.color,
                              border: `1px solid ${statusInfo.border}`,
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {statusInfo.label}
                          </span>
                        </div>

                        {/* Thông tin số đo thời gian */}
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
                          {task.generation_ms !== undefined && (
                            <span>Sinh mã: {task.generation_ms} ms</span>
                          )}
                          {task.run_ms !== undefined && (
                            <span>Thực thi: {task.run_ms} ms</span>
                          )}
                          {task.toolpack && (
                            <span>Bộ công cụ: {task.toolpack}</span>
                          )}
                        </div>

                        {/* Kết quả thực thi dạng bảng */}
                        {tableData.isJson && tableData.rows.length > 0 && (
                          <div style={{ marginTop: '8px', overflowX: 'auto' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              Dữ liệu kết quả:
                            </span>
                            <table
                              style={{
                                width: '100%',
                                marginTop: '6px',
                                borderCollapse: 'collapse',
                                fontSize: '13px',
                                textAlign: 'left',
                              }}
                            >
                              <thead>
                                <tr style={{ backgroundColor: 'var(--bg-page)', borderBottom: '2px solid var(--border-strong)' }}>
                                  {Object.keys(tableData.rows[0]).map((col) => (
                                    <th key={col} style={{ padding: '8px 12px', fontWeight: 600 }}>
                                      {col}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {tableData.rows.map((row, idx) => (
                                  <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                    {Object.values(row).map((val, cellIdx) => (
                                      <td key={cellIdx} style={{ padding: '8px 12px' }}>
                                        {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Kết quả thực thi dạng văn bản thuần */}
                        {task.run_result?.stdout && !tableData.isJson && (
                          <div style={{ marginTop: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              Đầu ra chương trình (stdout):
                            </span>
                            <pre
                              style={{
                                marginTop: '6px',
                                padding: '10px 14px',
                                borderRadius: '8px',
                                backgroundColor: 'var(--bg-page)',
                                border: '1px solid var(--border-subtle)',
                                fontFamily: 'monospace',
                                fontSize: '13px',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                              }}
                            >
                              {task.run_result.stdout}
                            </pre>
                          </div>
                        )}

                        {/* Danh sách công cụ đã gọi */}
                        {task.run_result?.tool_calls && task.run_result.tool_calls.length > 0 && (
                          <div style={{ marginTop: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              Các công cụ đã thực hiện:
                            </span>
                            <div style={{ marginTop: '6px', overflowX: 'auto' }}>
                              <table
                                style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  fontSize: '12px',
                                  backgroundColor: 'var(--bg-page)',
                                  borderRadius: '6px',
                                  overflow: 'hidden',
                                }}
                              >
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left' }}>
                                    <th style={{ padding: '6px 10px' }}>Tên công cụ</th>
                                    <th style={{ padding: '6px 10px' }}>Tham số</th>
                                    <th style={{ padding: '6px 10px' }}>Thời gian</th>
                                    <th style={{ padding: '6px 10px' }}>Loại tác vụ</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {task.run_result.tool_calls.map((tc, tcIdx) => (
                                    <tr key={tcIdx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600 }}>
                                        {tc.tool}
                                      </td>
                                      <td style={{ padding: '6px 10px', fontFamily: 'monospace' }}>
                                        {JSON.stringify(tc.args)}
                                      </td>
                                      <td style={{ padding: '6px 10px' }}>{tc.ms} ms</td>
                                      <td style={{ padding: '6px 10px' }}>
                                        <span
                                          style={{
                                            fontSize: '11px',
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            backgroundColor: tc.effect ? '#fef3c7' : '#eff6ff',
                                            color: tc.effect ? '#b45309' : '#1d4ed8',
                                            fontWeight: 500,
                                          }}
                                        >
                                          {tc.effect ? 'Tác dụng phụ' : 'Tra cứu'}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Thông báo lỗi nếu có */}
                        {task.error && (
                          <div
                            style={{
                              marginTop: '6px',
                              padding: '8px 12px',
                              borderRadius: '6px',
                              backgroundColor: '#fef2f2',
                              border: '1px solid #fca5a5',
                              color: '#b91c1c',
                              fontSize: '13px',
                            }}
                          >
                            {task.error}
                          </div>
                        )}

                        {/* Nút hành động xem mã và thử lại */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          {task.code && (
                            <button
                              type="button"
                              onClick={() => setViewingCode(task.code ?? null)}
                              style={{
                                fontSize: '13px',
                                padding: '5px 12px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-strong)',
                                backgroundColor: 'var(--bg-surface)',
                                fontWeight: 500,
                              }}
                            >
                              Xem mã AutoLang
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void retryTask(task.id)}
                            style={{
                              fontSize: '13px',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              border: '1px solid var(--border-strong)',
                              backgroundColor: 'var(--bg-surface)',
                              fontWeight: 500,
                            }}
                          >
                            Chạy lại tác vụ
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Ô nhập tác vụ AutoLang */}
            <div className="chat-composer-outer">
              {errorMessage && (
                <div
                  style={{
                    maxWidth: '880px',
                    margin: '0 auto 8px auto',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fca5a5',
                    color: '#b91c1c',
                    fontSize: '13px',
                  }}
                >
                  {errorMessage}
                </div>
              )}
              <form
                className="chat-composer-card"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault()
                  void submitTask()
                }}
              >
                <textarea
                  ref={textareaRef}
                  className="chat-composer-textarea"
                  aria-label="Tác vụ AutoLang"
                  placeholder="Nhập tác vụ nghiệp vụ cho AutoLang AI (ví dụ: Đếm số đơn đang giao, Tìm sản phẩm áo...)"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  disabled={submitting}
                />
                <div className="chat-composer-toolbar">
                  <span className="composer-key-hint">
                    Enter để thực thi tác vụ · Shift + Enter để xuống dòng
                  </span>
                  <button
                    className="composer-send-button"
                    type="submit"
                    aria-label="Thực thi tác vụ"
                    disabled={!draft.trim() || submitting}
                  >
                    <span>Thực thi tác vụ</span>
                  </button>
                </div>
              </form>
            </div>
          </section>
        </div>
      </div>

      {/* Cửa sổ xem mã AutoLang */}
      {viewingCode !== null && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px',
          }}
          onClick={() => setViewingCode(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '720px',
              maxHeight: '85vh',
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 20px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Mã nguồn AutoLang đã tạo</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => copyCodeToClipboard(viewingCode)}
                  style={{
                    fontSize: '13px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong)',
                    fontWeight: 500,
                  }}
                >
                  {copiedCode ? 'Đã sao chép' : 'Sao chép mã'}
                </button>
                <button
                  type="button"
                  onClick={() => setViewingCode(null)}
                  style={{
                    fontSize: '14px',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong)',
                  }}
                >
                  Đóng
                </button>
              </div>
            </div>
            <pre
              style={{
                padding: '16px 20px',
                margin: 0,
                backgroundColor: 'var(--bg-page)',
                fontFamily: 'monospace',
                fontSize: '13px',
                lineHeight: 1.6,
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {viewingCode}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
