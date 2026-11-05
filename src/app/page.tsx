'use client'

import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  KeyRound,
  LockKeyhole,
  Menu,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react'

type MessageRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: MessageRole
  content: string
}

type Suggestion = {
  title: string
  prompt: string
}

const promptStoragePrefix = 'ada-ai-v1-agent-instructions:'
const suggestions: Suggestion[] = [
  {
    title: 'Viết nội dung',
    prompt: 'Giúp tôi viết một bài giới thiệu ngắn cho cửa hàng của mình.',
  },
  {
    title: 'Phân tích dữ liệu',
    prompt: 'Tôi nên bắt đầu phân tích hiệu quả kinh doanh từ những chỉ số nào?',
  },
  {
    title: 'Lên kế hoạch',
    prompt: 'Giúp tôi lên kế hoạch công việc cho tuần này.',
  },
  {
    title: 'Brainstorm ý tưởng',
    prompt: 'Gợi ý một vài ý tưởng khuyến mãi sáng tạo cho khách hàng thân thiết.',
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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

function createMessage(role: MessageRole, content: string): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role,
    content,
  }
}

export default function HomePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [agentInstructions, setAgentInstructions] = useState('')
  const [savedInstructions, setSavedInstructions] = useState('')
  const [instructionStorageKey, setInstructionStorageKey] = useState<string | null>(null)
  const [instructionsError, setInstructionsError] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [showApiKeyDialog, setShowApiKeyDialog] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sending, setSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const conversationRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, sending])

  const hasUnsavedChanges = agentInstructions !== savedInstructions
  const isPromptActive = Boolean(apiKey && savedInstructions.trim()) &&
    agentInstructions === savedInstructions

  function saveInstructions(): void {
    if (!instructionStorageKey) {
      setInstructionsError('Hãy kết nối API key để lưu chỉ dẫn riêng cho tài khoản này.')
      return
    }

    try {
      window.localStorage.setItem(instructionStorageKey, agentInstructions)
      setSavedInstructions(agentInstructions)
      setInstructionsError(null)
      setSavedAt(new Intl.DateTimeFormat('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date()))
    } catch {
      setInstructionsError('Không thể lưu chỉ dẫn. Hãy kiểm tra dung lượng trình duyệt.')
    }
  }

  function resetInstructions(): void {
    setAgentInstructions('')
  }

  function startNewChat(): void {
    setMessages([])
    setChatError(null)
    setDraft('')
    textareaRef.current?.focus()
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

    if (!apiKey) {
      setDraft(text)
      setApiKeyDraft('')
      setShowApiKeyDialog(true)
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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'openai/gpt-oss-20b',
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          agentInstructions: savedInstructions,
        }),
      })

      const result: unknown = await response.json()
      if (!response.ok) {
        throw new Error(getErrorMessage(result, `Yêu cầu thất bại (${response.status}).`))
      }

      const answer = getResponseMessage(result)
      if (answer === null) {
        throw new Error('Phản hồi từ API không đúng định dạng chat completions.')
      }
      setMessages((currentMessages) => [
        ...currentMessages,
        createMessage('assistant', answer),
      ])
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Không thể kết nối Ada AI.')
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

  function connectApi(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const trimmedKey = apiKeyDraft.trim()
    if (!trimmedKey) {
      return
    }
    void (async () => {
      try {
        const digest = await window.crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(trimmedKey)
        )
        const keyFingerprint = Array.from(new Uint8Array(digest))
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('')
        const storageKey = `${promptStoragePrefix}${keyFingerprint}`
        const storedInstructions = window.localStorage.getItem(storageKey) ?? ''
        setInstructionStorageKey(storageKey)
        setAgentInstructions(storedInstructions)
        setSavedInstructions(storedInstructions)
        setInstructionsError(null)
        setSavedAt(null)
        setApiKey(trimmedKey)
        setMessages([])
        setApiKeyDraft('')
        setShowApiKeyDialog(false)
      } catch {
        setInstructionsError('Không thể tải chỉ dẫn riêng cho API key này trên trình duyệt.')
      }
    })()
  }

  const isPromptSaved = Boolean(
    instructionStorageKey && savedInstructions.trim() && !hasUnsavedChanges && !instructionsError
  )

  return (
    <main className="app-shell">
      {sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-top">
            <a className="brand" href="/" aria-label="Ada AI, trang chủ">
              <span className="brand-mark"><Sparkles size={18} strokeWidth={2.2} /></span>
              <span className="brand-name">ada<span>ai</span></span>
            </a>
            <button
              className="icon-button sidebar-collapse"
              onClick={() => setSidebarOpen(false)}
              aria-label="Thu gọn thanh bên"
            >
              <Menu size={18} />
            </button>
          </div>

          <button className="agent-switcher" type="button">
            <span className="agent-avatar"><Sparkles size={15} /></span>
            <span className="agent-switcher-copy">
              <strong>Ada AI v1</strong>
              <small>Trợ lý cá nhân</small>
            </span>
            <ChevronDown size={16} className="muted-icon" />
          </button>

          <button className="new-chat-button" type="button" onClick={startNewChat}>
            <MessageSquarePlus size={17} />
            <span>Cuộc trò chuyện mới</span>
            <span className="shortcut">⌘ K</span>
          </button>

          <div className="history-section">
            <div className="section-label">Gần đây</div>
            <p className="history-empty">Lịch sử hội thoại sẽ có trong bản cập nhật tiếp theo.</p>
          </div>

          <div className="sidebar-bottom">
            <div className="sidebar-status">
              <span className={`status-dot ${apiKey ? 'connected' : ''}`} />
              <span>{apiKey ? 'API đã kết nối' : 'Chưa kết nối API'}</span>
              <button
                className="status-action"
                type="button"
                onClick={() => {
                  setApiKeyDraft('')
                  setShowApiKeyDialog(true)
                }}
              >
                {apiKey ? 'Quản lý' : 'Kết nối'}
              </button>
            </div>
            <button className="account-button" type="button">
              <span className="account-avatar">A</span>
              <span className="account-copy">
                <strong>Không gian của bạn</strong>
                <small>Gói cá nhân</small>
              </span>
              <ChevronRight size={16} className="muted-icon" />
            </button>
          </div>
        </aside>
      )}

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            {!sidebarOpen && (
              <button
                className="icon-button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Mở thanh bên"
              >
                <Menu size={18} />
              </button>
            )}
            <span className="mobile-brand"><span className="brand-mark"><Sparkles size={16} /></span></span>
            <button className="model-picker" type="button">
              <span>Ada AI v1</span>
              <span className="model-version">Mô hình</span>
              <ChevronDown size={15} />
            </button>
          </div>
          <div className="topbar-actions">
            <div className="secure-label"><ShieldCheck size={15} /> Riêng tư & an toàn</div>
            <button
              className={`icon-button workspace-toggle ${workspaceOpen ? 'selected' : ''}`}
              onClick={() => setWorkspaceOpen((open) => !open)}
              aria-label={workspaceOpen ? 'Đóng bàn làm việc' : 'Mở bàn làm việc'}
              title={workspaceOpen ? 'Đóng bàn làm việc' : 'Mở bàn làm việc'}
            >
              {workspaceOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
            </button>
            <button className="icon-button help-button" aria-label="Trợ giúp" type="button">
              <CircleHelp size={18} />
            </button>
          </div>
        </header>

        <div className={`work-area ${workspaceOpen ? '' : 'workspace-hidden'}`}>
          <section className="chat-panel">
            {messages.length === 0 ? (
              <div className="welcome-screen">
                <div className="welcome-mark"><Sparkles size={25} strokeWidth={1.7} /></div>
                <div className="welcome-eyebrow">TRỢ LÝ AI CỦA BẠN</div>
                <h1>Bạn muốn bắt đầu<br />với điều gì?</h1>
                <p className="welcome-description">
                  Một không gian làm việc riêng, nơi Ada hiểu cách bạn muốn làm việc.
                </p>
                <div className="suggestion-grid">
                  {suggestions.map((suggestion, index) => (
                    <button
                      className="suggestion-card"
                      key={suggestion.title}
                      type="button"
                      onClick={() => void sendMessage(undefined, suggestion.prompt)}
                    >
                      <span className={`suggestion-icon suggestion-icon-${index}`}>
                        {index === 0 ? <Plus size={16} /> : index === 1 ? <Settings2 size={16} /> : index === 2 ? <Clock3 size={16} /> : <Sparkles size={16} />}
                      </span>
                      <span>
                        <strong>{suggestion.title}</strong>
                        <small>{suggestion.prompt}</small>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="conversation" ref={conversationRef}>
                <div className="message-list">
                  {messages.map((message) => (
                    <article
                      className={`message-row ${message.role === 'user' ? 'user-message' : 'assistant-message'}`}
                      key={message.id}
                    >
                      {message.role === 'assistant' && (
                        <span className="message-avatar"><Sparkles size={14} /></span>
                      )}
                      <div className="message-content">
                        {message.role === 'assistant' && <div className="message-author">Ada AI</div>}
                        <div className="message-text">{message.content}</div>
                      </div>
                    </article>
                  ))}
                  {sending && (
                    <div className="message-row assistant-message">
                      <span className="message-avatar"><Sparkles size={14} /></span>
                      <div className="thinking-indicator"><i /><i /><i /><span>Ada đang suy nghĩ</span></div>
                    </div>
                  )}
                  {chatError && (
                    <div className="chat-error" role="alert">
                      <span>{chatError}</span>
                      <button
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

            <div className="composer-wrap">
              <form className="composer" onSubmit={(event) => void sendMessage(event)}>
                <textarea
                  ref={textareaRef}
                  aria-label="Tin nhắn cho Ada AI"
                  placeholder="Nhắn tin cho Ada AI..."
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  rows={1}
                  disabled={sending}
                />
                <div className="composer-toolbar">
                  <div className="composer-tools">
                    <button className="composer-tool" type="button" title="Đính kèm tệp (sắp ra mắt)" aria-label="Đính kèm tệp">
                      <Paperclip size={17} />
                    </button>
                    <span className="composer-hint">Shift + Enter để xuống dòng</span>
                  </div>
                  <div className="composer-actions">
                    <span className="model-hint">Ada AI v1</span>
                    <button
                      className="send-button"
                      type="submit"
                      aria-label="Gửi tin nhắn"
                      disabled={!draft.trim() || sending}
                    >
                      <ArrowUp size={17} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
              </form>
              <div className="disclaimer">
                Ada có thể mắc lỗi. Hãy kiểm tra lại thông tin quan trọng.
                <span className="disclaimer-separator">·</span>
                <button type="button" onClick={() => setShowApiKeyDialog(true)}>Cài đặt API</button>
              </div>
            </div>
          </section>

          {workspaceOpen && (
            <aside className="workspace-panel">
              <div className="workspace-header">
                <div>
                  <div className="workspace-kicker">BÀN LÀM VIỆC</div>
                  <h2>Chỉ dẫn cho Agent</h2>
                </div>
                <button
                  className="icon-button workspace-close"
                  type="button"
                  aria-label="Đóng bàn làm việc"
                  onClick={() => setWorkspaceOpen(false)}
                >
                  <X size={17} />
                </button>
              </div>

              <div className="workspace-body">
                <div className="agent-card">
                  <div className="agent-card-icon"><Sparkles size={17} /></div>
                  <div className="agent-card-copy">
                    <strong>Ada AI v1</strong>
                    <span>Trợ lý riêng của bạn</span>
                  </div>
                  <span className={`live-indicator ${apiKey ? '' : 'disconnected'}`}>
                    <i /> {apiKey ? 'Đang hoạt động' : 'Chưa kết nối'}
                  </span>
                </div>

                <div className="instruction-heading">
                  <div>
                    <h3>System prompt riêng</h3>
                    <p>Dạy Ada cách làm việc theo ý bạn.</p>
                  </div>
                  <span className="private-badge"><LockKeyhole size={12} /> RIÊNG</span>
                </div>

                <div className="prompt-editor-wrap">
                  <label className="sr-only" htmlFor="agent-instructions">System prompt riêng cho Agent</label>
                  <textarea
                    id="agent-instructions"
                    className="prompt-editor"
                    placeholder={'Ví dụ:\nBạn là trợ lý cho cửa hàng thời trang của tôi.\n\n• Trả lời bằng tiếng Việt, thân thiện và ngắn gọn\n• Nếu không chắc về giá hoặc tồn kho, hãy hỏi lại\n• Không tự bịa thông tin chưa có trong dữ liệu'}
                    value={agentInstructions}
                    onChange={(event) => setAgentInstructions(event.target.value)}
                    maxLength={12000}
                  />
                  <div className="editor-footer">
                    <span>{agentInstructions.length.toLocaleString('vi-VN')} / 12.000</span>
                    <span className="editor-private"><LockKeyhole size={11} /> Chỉ áp dụng cho Agent này</span>
                  </div>
                </div>

                {instructionsError && <p className="inline-error" role="alert">{instructionsError}</p>}

                <button
                  className="save-prompt-button"
                  type="button"
                  onClick={saveInstructions}
                  disabled={!instructionStorageKey || !hasUnsavedChanges}
                >
                  {isPromptSaved ? <Check size={15} /> : <Settings2 size={15} />}
                  {isPromptSaved ? 'Đã lưu chỉ dẫn' : 'Lưu chỉ dẫn'}
                </button>

                <div className="prompt-status">
                  <span className={`status-dot ${isPromptActive ? 'connected' : 'warning'}`} />
                  <span>
                    {hasUnsavedChanges
                      ? 'Có thay đổi chưa lưu'
                      : savedInstructions
                        ? savedAt ? `Đã lưu lúc ${savedAt}` : 'Chỉ dẫn đang được áp dụng'
                        : 'Chưa thêm chỉ dẫn riêng'}
                  </span>
                  {savedInstructions && (
                    <button className="text-button" type="button" onClick={resetInstructions}>
                      Đặt lại
                    </button>
                  )}
                </div>

                <div className="prompt-impact">
                  <div className="impact-icon"><ShieldCheck size={16} /></div>
                  <div>
                    <strong>Chỉ dẫn có phạm vi riêng</strong>
                    <p>Nội dung này được chèn vào mỗi yêu cầu của Ada AI v1. Prompt hệ thống nền không bị thay đổi.</p>
                  </div>
                </div>

                <div className="workspace-divider" />

                <button
                  className="api-settings-row"
                  type="button"
                  onClick={() => {
                    setApiKeyDraft('')
                    setShowApiKeyDialog(true)
                  }}
                >
                  <span className="api-settings-icon"><KeyRound size={16} /></span>
                  <span className="api-settings-copy">
                    <strong>API cá nhân</strong>
                    <small>{apiKey ? 'Khóa đang dùng trong phiên này' : 'Kết nối API key của bạn'}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>

                <div className="workspace-footnote">
                  <LockKeyhole size={13} />
                  <span>Chỉ dẫn được lưu trên trình duyệt này, không chia sẻ với Agent khác.</span>
                </div>
              </div>
            </aside>
          )}
        </div>
      </section>

      {showApiKeyDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowApiKeyDialog(false)
            }
          }}
        >
          <section className="api-dialog" role="dialog" aria-modal="true" aria-labelledby="api-dialog-title">
            <button className="icon-button dialog-close" onClick={() => setShowApiKeyDialog(false)} aria-label="Đóng" type="button">
              <X size={18} />
            </button>
            <div className="dialog-key-icon"><KeyRound size={20} /></div>
            <h2 id="api-dialog-title">{apiKey ? 'Quản lý API key' : 'Kết nối API cá nhân'}</h2>
            <p>Nhập API key Ada AI của bạn để bắt đầu trò chuyện với mô hình.</p>
            <form onSubmit={connectApi}>
              <label htmlFor="api-key">API key</label>
              <input
                id="api-key"
                type="password"
                autoComplete="off"
                placeholder="ada_sk_••••••••••••••••"
                value={apiKeyDraft}
                onChange={(event) => setApiKeyDraft(event.target.value)}
                autoFocus
              />
              <div className="key-privacy"><LockKeyhole size={13} /> Key chỉ được giữ trong bộ nhớ của phiên này.</div>
              <button className="dialog-submit" type="submit" disabled={!apiKeyDraft.trim()}>
                Kết nối an toàn
              </button>
            </form>
            {apiKey && (
              <button className="disconnect-button" type="button" onClick={() => {
                setApiKey('')
                setInstructionStorageKey(null)
                setAgentInstructions('')
                setSavedInstructions('')
                setSavedAt(null)
                setMessages([])
                setShowApiKeyDialog(false)
              }}>
                Ngắt kết nối API
              </button>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
