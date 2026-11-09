'use client'

import { FormEvent, KeyboardEvent, useEffect, useRef, useState, MouseEvent } from 'react'
import { MarkdownRenderer } from '@/components/MarkdownRenderer'
import {
  Account,
  clearStoredAccount,
  getAccountFromPayload,
  loadStoredAccount,
  saveStoredAccount,
} from '@/lib/auth-storage'

type MessageRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: MessageRole
  content: string
}

type Conversation = {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

type Suggestion = {
  title: string
  prompt: string
}

const suggestions: Suggestion[] = [
  {
    title: 'Soạn thảo văn bản',
    prompt: 'Soạn một thông báo ngắn gọn và chuyên nghiệp gửi đến khách hàng.',
  },
  {
    title: 'Phân tích công việc',
    prompt: 'Gợi ý các tiêu chí quan trọng để đánh giá hiệu quả công việc tuần này.',
  },
  {
    title: 'Lên kế hoạch',
    prompt: 'Giúp tôi lập kế hoạch phân bổ thời gian cho các mục tiêu ưu tiên.',
  },
  {
    title: 'Chiến lược tiếp thị',
    prompt: 'Đề xuất các ý tưởng quảng bá thu hút khách hàng tiềm năng.',
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isConversation(value: unknown): value is Conversation {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.updatedAt === 'number' &&
    Array.isArray(value.messages)
  )
}

function loadStoredConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem('ada_chat_conversations')
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter(isConversation)
    }
  } catch {
    // Bỏ qua lỗi đọc dữ liệu lưu trữ
  }
  return []
}

function saveStoredConversations(conversations: Conversation[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem('ada_chat_conversations', JSON.stringify(conversations))
  } catch {
    // Bỏ qua lỗi ghi dữ liệu lưu trữ
  }
}

function getResponseMessage(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return null
  }

  const firstChoice: unknown = value.choices[0]
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return null
  }

  return typeof firstChoice.message.content === 'string'
    ? firstChoice.message.content
    : null
}

function getErrorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value) || !isRecord(value.error)) {
    return fallback
  }

  return typeof value.error.message === 'string'
    ? value.error.message
    : fallback
}

function getAccount(value: unknown): Account | null {
  return getAccountFromPayload(value)
}

function createMessage(role: MessageRole, content: string): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  }
}

export default function ChatPage() {
  const [currentConversationId, setCurrentConversationId] = useState<string>(() =>
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [agentInstructions, setAgentInstructions] = useState('')
  const [savedInstructions, setSavedInstructions] = useState('')
  const [instructionsError, setInstructionsError] = useState<string | null>(null)
  const [account, setAccount] = useState<Account | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [savingInstructions, setSavingInstructions] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function syncSmallScreenLayout(): void {
      if (window.innerWidth <= 860) {
        setSidebarOpen(false)
      }
      if (window.innerWidth <= 650) {
        setWorkspaceOpen(false)
      }
    }

    syncSmallScreenLayout()
    window.addEventListener('resize', syncSmallScreenLayout)
    return () => window.removeEventListener('resize', syncSmallScreenLayout)
  }, [])

  useEffect(() => {
    setConversations(loadStoredConversations())
  }, [])

  useEffect(() => {
    const cachedAccount = loadStoredAccount()
    if (cachedAccount) {
      setAccount(cachedAccount)
      setAuthLoading(false)
    }

    const controller = new AbortController()

    async function loadAccount(): Promise<void> {
      try {
        const accountResponse = await fetch('/api/auth/me', { signal: controller.signal })
        if (accountResponse.status === 401) {
          // Phiên khách chưa xác thực danh tính
          setAccount(null)
          clearStoredAccount()
          setAuthError(null)
        } else if (!accountResponse.ok) {
          throw new Error('Không thể tải thông tin tài khoản.')
        } else {
          const accountPayload: unknown = await accountResponse.json()
          const loadedAccount = getAccount(accountPayload)
          if (!loadedAccount) {
            throw new Error('Thông tin tài khoản không hợp lệ.')
          }
          setAccount(loadedAccount)
          saveStoredAccount(loadedAccount)
          setAuthError(null)
        }

        const agentResponse = await fetch('/api/agent', { signal: controller.signal })
        if (agentResponse.ok) {
          const agentPayload: unknown = await agentResponse.json()
          if (isRecord(agentPayload) && typeof agentPayload.instructions === 'string') {
            setAgentInstructions(agentPayload.instructions)
            setSavedInstructions(agentPayload.instructions)
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setAuthError(error instanceof Error ? error.message : 'Không thể tải thông tin tài khoản.')
      } finally {
        if (!controller.signal.aborted) {
          setAuthLoading(false)
        }
      }
    }

    void loadAccount()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, sending])

  const hasUnsavedChanges = agentInstructions !== savedInstructions
  const isPromptActive = Boolean(savedInstructions.trim()) &&
    agentInstructions === savedInstructions

  async function saveInstructions(): Promise<void> {
    setSavingInstructions(true)
    try {
      const response = await fetch('/api/agent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instructions: agentInstructions }),
      })
      if (!response.ok) {
        const payload: unknown = await response.json()
        throw new Error(getErrorMessage(payload, 'Không thể lưu chỉ dẫn.'))
      }
      setSavedInstructions(agentInstructions)
      setInstructionsError(null)
      setSavedAt(new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date()))
    } catch (error) {
      setInstructionsError(error instanceof Error ? error.message : 'Không thể lưu chỉ dẫn.')
    } finally {
      setSavingInstructions(false)
    }
  }

  function resetInstructions(): void {
    setAgentInstructions('')
  }

  function startNewChat(): void {
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    setCurrentConversationId(newId)
    setMessages([])
    setChatError(null)
    setDraft('')
    textareaRef.current?.focus()
  }

  function selectConversation(conv: Conversation): void {
    setCurrentConversationId(conv.id)
    setMessages(conv.messages)
    setChatError(null)
    if (window.innerWidth <= 860) {
      setSidebarOpen(false)
    }
  }

  function deleteConversation(convId: string, event: MouseEvent): void {
    event.stopPropagation()
    setConversations((prev) => {
      const nextList = prev.filter((item) => item.id !== convId)
      saveStoredConversations(nextList)
      return nextList
    })
    if (currentConversationId === convId) {
      startNewChat()
    }
  }

  async function sendMessage(
    event?: FormEvent<HTMLFormElement>,
    suggestedText?: string,
    retrying = false
  ): Promise<void> {
    event?.preventDefault()
    const text = (suggestedText ?? draft).trim()
    if (!text || sending) {
      return
    }

    const nextMessages = retrying
      ? messages
      : [...messages, createMessage('user', text)]
    if (!retrying) {
      setMessages(nextMessages)
    }
    setDraft('')
    setChatError(null)
    setSending(true)

    try {
      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      })

      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(getErrorMessage(result, 'Yêu cầu không thành công.'))
      }

      const answer = getResponseMessage(result)
      if (answer === null) {
        throw new Error('Hệ thống chưa thể xử lý câu trả lời.')
      }

      const assistantMsg = createMessage('assistant', answer)
      const finalMessages = [...nextMessages, assistantMsg]
      setMessages(finalMessages)

      const title = nextMessages[0]?.content.slice(0, 32) || 'Cuộc trò chuyện'
      setConversations((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === currentConversationId)
        const updatedItem: Conversation = {
          id: currentConversationId,
          title,
          messages: finalMessages,
          updatedAt: Date.now(),
        }
        let nextList: Conversation[]
        if (existingIndex >= 0) {
          nextList = [...prev]
          nextList[existingIndex] = updatedItem
        } else {
          nextList = [updatedItem, ...prev]
        }
        saveStoredConversations(nextList)
        return nextList
      })
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Không thể kết nối với Ada AI.')
    } finally {
      setSending(false)
      textareaRef.current?.focus()
    }
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  async function signOut(): Promise<void> {
    try {
      clearStoredAccount()
      setAccount(null)
      const response = await fetch('/api/auth/logout', { method: 'POST' })
      if (!response.ok) {
        setAuthError('Không thể đăng xuất.')
        return
      }
      window.location.assign('/login')
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Không thể đăng xuất.')
    }
  }

  const isPromptSaved = Boolean(
    savedInstructions.trim() && !hasUnsavedChanges && !instructionsError
  )

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
            <a className="sidebar-brand-link" href="/chat" aria-label="Trang chủ Ada AI">
              <span className="brand-logo-text">Ada<strong>AI</strong></span>
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
            <button className="chat-new-btn" type="button" onClick={startNewChat}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>Cuộc trò chuyện mới</span>
            </button>
          </div>

          <nav className="chat-nav-menu" aria-label="Điều hướng chính">
            <a className="chat-nav-item active" href="/chat">Trò chuyện Ada AI</a>
            <a className="chat-nav-item" href="/autolang">AutoLang AI (Độc lập)</a>
            {!account && !authLoading && (
              <a className="chat-nav-item" href="/login">Tài khoản & Đăng nhập</a>
            )}
          </nav>

          <div className="chat-sidebar-section">
            <span className="chat-section-label">Lịch sử trò chuyện</span>
            <div className="chat-history-list">
              {conversations.length === 0 ? (
                <p className="chat-history-note">
                  {messages.length > 0 ? 'Phiên trò chuyện hiện tại' : 'Chưa có lịch sử hội thoại.'}
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
                      onClick={(event) => deleteConversation(conv.id, event)}
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
              <div className="chat-anon-profile">
                <span className="anon-status-text">
                  {authLoading ? 'Đang chuẩn bị phiên làm việc...' : 'Phiên làm việc thử nghiệm'}
                </span>
                {!authLoading && (
                  <a className="anon-login-link" href="/login">
                    Đăng nhập
                  </a>
                )}
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
            <div className="chat-model-badge">Ada AI · gpt-oss-20b</div>
          </div>

          <div className="chat-topbar-right">
            <a
              href="/autolang"
              className="chat-topbar-link"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid var(--border-strong)',
                marginRight: '6px',
                fontWeight: 500,
              }}
            >
              Chuyển sang AutoLang AI
            </a>
            <button
              className={`chat-topbar-toggle ${workspaceOpen ? 'active' : ''}`}
              type="button"
              onClick={() => setWorkspaceOpen((open) => !open)}
              aria-label="Bật tắt chỉ dẫn hệ thống"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              <span>{workspaceOpen ? 'Ẩn chỉ dẫn' : 'Chỉ dẫn hệ thống'}</span>
            </button>
            {account ? (
              <button
                type="button"
                className="chat-topbar-link"
                onClick={() => setWorkspaceOpen(true)}
              >
                Khóa API
              </button>
            ) : authLoading ? null : (
              <a className="chat-topbar-link" href="/login">
                Đăng nhập
              </a>
            )}
          </div>
        </header>

        <div className="chat-body-layout">
          <section className="chat-conversation-panel">
            {messages.length === 0 ? (
              <div className="chat-welcome-container">
                <div className="welcome-header-box">
                  <h1 className="welcome-main-title">Ada AI</h1>
                  <p className="welcome-main-desc">
                    Trợ lý hỗ trợ giải đáp, xử lý nội dung và tương tác theo chỉ dẫn riêng.
                  </p>
                </div>

                <div className="welcome-suggestions-grid">
                  {suggestions.map((suggestion) => (
                    <button
                      className="suggestion-action-card"
                      key={suggestion.title}
                      type="button"
                      onClick={() => void sendMessage(undefined, suggestion.prompt)}
                    >
                      <span className="suggestion-action-title">{suggestion.title}</span>
                      <span className="suggestion-action-desc">{suggestion.prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="chat-messages-container" ref={conversationRef}>
                <div className="chat-messages-inner">
                  {messages.map((message) => (
                    <article
                      className={`chat-message-row ${message.role === 'user' ? 'row-user' : 'row-assistant'}`}
                      key={message.id}
                    >
                      {message.role === 'assistant' && (
                        <div className="assistant-sender-tag">Ada AI</div>
                      )}
                      <div className="chat-message-bubble">
                        <MarkdownRenderer content={message.content} />
                      </div>
                    </article>
                  ))}

                  {sending && (
                    <div className="chat-message-row row-assistant">
                      <div className="assistant-sender-tag">Ada AI</div>
                      <div className="chat-message-bubble bubble-thinking">
                        <span className="pulse-dot" />
                        <span className="pulse-dot" />
                        <span className="pulse-dot" />
                      </div>
                    </div>
                  )}

                  {chatError && (
                    <div className="chat-error-banner" role="alert">
                      <span className="error-text">{chatError}</span>
                      <button
                        className="error-retry-btn"
                        type="button"
                        onClick={() => {
                          setChatError(null)
                          const lastUserMessage = [...messages]
                            .reverse()
                            .find((message) => message.role === 'user')
                          if (lastUserMessage) {
                            void sendMessage(undefined, lastUserMessage.content, true)
                          }
                        }}
                      >
                        Thử lại
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="chat-composer-outer">
              <form className="chat-composer-card" onSubmit={(event) => void sendMessage(event)}>
                <textarea
                  ref={textareaRef}
                  className="chat-composer-textarea"
                  aria-label="Tin nhắn cho Ada AI"
                  placeholder="Nhập nội dung tin nhắn..."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  rows={2}
                  disabled={sending}
                />
                <div className="chat-composer-toolbar">
                  <span className="composer-key-hint">
                    Enter để gửi · Shift + Enter để xuống dòng
                  </span>
                  <button
                    className="composer-send-button"
                    type="submit"
                    aria-label="Gửi tin nhắn"
                    disabled={!draft.trim() || sending}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    <span>Gửi</span>
                  </button>
                </div>
              </form>
              <p className="chat-disclaimer-note">
                Nội dung do trợ lý AI tạo có thể cần được kiểm tra lại trước khi áp dụng vào thực tế.
              </p>
            </div>
          </section>

          {workspaceOpen && (
            <aside className="chat-instructions-sidebar">
              <div className="instructions-sidebar-header">
                <div>
                  <h2 className="instructions-title">Chỉ dẫn hệ thống</h2>
                  <p className="instructions-desc">Cấu hình vai trò và nguyên tắc phản hồi của trợ lý</p>
                </div>
                <button
                  className="chat-icon-btn"
                  type="button"
                  aria-label="Đóng chỉ dẫn hệ thống"
                  title="Đóng"
                  onClick={() => setWorkspaceOpen(false)}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="instructions-sidebar-body">
                <div className="instructions-input-wrap">
                  <label className="sr-only" htmlFor="agent-instructions">Chỉ dẫn hệ thống</label>
                  <textarea
                    id="agent-instructions"
                    className="instructions-textarea"
                    placeholder={'Ví dụ:\nTrả lời bằng tiếng Việt, lịch sự và súc tích.\nNếu câu hỏi chưa rõ ràng, hãy chủ động làm rõ trước khi trả lời.'}
                    value={agentInstructions}
                    onChange={(event) => setAgentInstructions(event.target.value)}
                    maxLength={12000}
                  />
                  <div className="instructions-char-count">
                    {agentInstructions.length.toLocaleString('vi-VN')} / 12.000 ký tự
                  </div>
                </div>

                {instructionsError && (
                  <p className="instructions-error-msg" role="alert">{instructionsError}</p>
                )}

                <div className="instructions-actions">
                  <button
                    className="instructions-save-btn"
                    type="button"
                    onClick={() => void saveInstructions()}
                    disabled={!hasUnsavedChanges || savingInstructions}
                  >
                    {savingInstructions ? 'Đang lưu...' : isPromptSaved ? 'Đã lưu' : 'Lưu chỉ dẫn'}
                  </button>

                  {savedInstructions && (
                    <button
                      className="instructions-reset-btn"
                      type="button"
                      onClick={resetInstructions}
                    >
                      Đặt lại
                    </button>
                  )}
                </div>

                <div className="instructions-status-row">
                  <span className={`status-indicator-dot ${isPromptActive ? 'active' : 'pending'}`} />
                  <span className="status-indicator-text">
                    {hasUnsavedChanges
                      ? 'Có thay đổi chưa lưu'
                      : savedInstructions
                        ? savedAt ? `Đã lưu lúc ${savedAt}` : 'Chỉ dẫn đang được áp dụng'
                        : 'Chưa thiết lập chỉ dẫn'}
                  </span>
                </div>

                <div className="instructions-divider" />

                <div className="api-key-summary-card">
                  <span className="summary-card-title">Khóa kết nối API</span>
                  <span className="summary-card-value">
                    {account
                      ? `${account.api_key_prefix}••••••••`
                      : authLoading
                        ? 'Đang tải khóa API...'
                        : 'Chưa đăng nhập'}
                  </span>
                </div>

                <p className="instructions-footer-note">
                  Chỉ dẫn được lưu trữ an toàn theo tài khoản của bạn.
                </p>

                {authError && <p className="instructions-error-msg" role="alert">{authError}</p>}
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  )
}
