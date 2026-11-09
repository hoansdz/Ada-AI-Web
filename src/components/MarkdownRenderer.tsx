'use client'

import React, { useMemo, useState, useCallback } from 'react'
import { marked, type Token, type Tokens } from 'marked'
import { Copy, Check } from 'lucide-react'

export interface MarkdownRendererProps {
  content: string
  className?: string
}

interface CodeBlockProps {
  code: string
  language?: string
}

function CodeBlock({ code, language }: CodeBlockProps): React.JSX.Element {
  const [copied, setCopied] = useState<boolean>(false)

  const handleCopy = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.clipboard) {
      return
    }

    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true)
        window.setTimeout(() => {
          setCopied(false)
        }, 2000)
      })
      .catch(() => {
        // Trình duyệt từ chối quyền truy cập clipboard
      })
  }, [code])

  const displayLang = language && language.trim().length > 0 ? language.trim().toLowerCase() : 'text'

  return (
    <div className="markdown-code-block">
      <div className="markdown-code-header">
        <span className="markdown-code-lang">{displayLang}</span>
        <button
          type="button"
          className="markdown-code-copy-btn"
          onClick={handleCopy}
          aria-label={copied ? 'Đã sao chép nội dung mã nguồn' : 'Sao chép mã nguồn'}
          title={copied ? 'Đã sao chép' : 'Sao chép'}
        >
          {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
          <span className="markdown-copy-label">{copied ? 'Đã sao chép' : 'Sao chép'}</span>
        </button>
      </div>
      <pre className="markdown-code-pre">
        <code className={`markdown-code-content ${displayLang ? `language-${displayLang}` : ''}`}>
          {code}
        </code>
      </pre>
    </div>
  )
}

function isHeading(token: Token): token is Tokens.Heading {
  return token.type === 'heading'
}

function isParagraph(token: Token): token is Tokens.Paragraph {
  return token.type === 'paragraph'
}

function isCode(token: Token): token is Tokens.Code {
  return token.type === 'code'
}

function isCodespan(token: Token): token is Tokens.Codespan {
  return token.type === 'codespan'
}

function isStrong(token: Token): token is Tokens.Strong {
  return token.type === 'strong'
}

function isEm(token: Token): token is Tokens.Em {
  return token.type === 'em'
}

function isDel(token: Token): token is Tokens.Del {
  return token.type === 'del'
}

function isBlockquote(token: Token): token is Tokens.Blockquote {
  return token.type === 'blockquote'
}

function isList(token: Token): token is Tokens.List {
  return token.type === 'list'
}

function isTable(token: Token): token is Tokens.Table {
  return token.type === 'table'
}

function isHr(token: Token): token is Tokens.Hr {
  return token.type === 'hr'
}

function isBr(token: Token): token is Tokens.Br {
  return token.type === 'br'
}

function isLink(token: Token): token is Tokens.Link {
  return token.type === 'link'
}

function isImage(token: Token): token is Tokens.Image {
  return token.type === 'image'
}

function isCheckbox(token: Token): token is Tokens.Checkbox {
  return token.type === 'checkbox'
}

function isText(token: Token): token is Tokens.Text {
  return token.type === 'text'
}

function isEscape(token: Token): token is Tokens.Escape {
  return token.type === 'escape'
}

function isHtml(token: Token): token is Tokens.HTML {
  return token.type === 'html'
}

function isSpace(token: Token): token is Tokens.Space {
  return token.type === 'space'
}

function renderTokens(tokens: Token[]): React.ReactNode {
  return tokens.map((token, index) => renderToken(token, index))
}

function renderToken(token: Token, index: number): React.ReactNode {
  const key = `token-${index}-${token.type}`

  if (isHeading(token)) {
    const headingChildren = token.tokens && token.tokens.length > 0
      ? renderTokens(token.tokens)
      : token.text

    switch (token.depth) {
      case 1:
        return <h1 key={key} className="markdown-h1">{headingChildren}</h1>
      case 2:
        return <h2 key={key} className="markdown-h2">{headingChildren}</h2>
      case 3:
        return <h3 key={key} className="markdown-h3">{headingChildren}</h3>
      case 4:
        return <h4 key={key} className="markdown-h4">{headingChildren}</h4>
      case 5:
        return <h5 key={key} className="markdown-h5">{headingChildren}</h5>
      default:
        return <h6 key={key} className="markdown-h6">{headingChildren}</h6>
    }
  }

  if (isParagraph(token)) {
    return (
      <p key={key} className="markdown-p">
        {renderTokens(token.tokens)}
      </p>
    )
  }

  if (isCode(token)) {
    return (
      <CodeBlock
        key={key}
        code={token.text}
        language={token.lang}
      />
    )
  }

  if (isCodespan(token)) {
    return (
      <code key={key} className="markdown-codespan">
        {token.text}
      </code>
    )
  }

  if (isStrong(token)) {
    return (
      <strong key={key} className="markdown-strong">
        {token.tokens && token.tokens.length > 0 ? renderTokens(token.tokens) : token.text}
      </strong>
    )
  }

  if (isEm(token)) {
    return (
      <em key={key} className="markdown-em">
        {token.tokens && token.tokens.length > 0 ? renderTokens(token.tokens) : token.text}
      </em>
    )
  }

  if (isDel(token)) {
    return (
      <del key={key} className="markdown-del">
        {token.tokens && token.tokens.length > 0 ? renderTokens(token.tokens) : token.text}
      </del>
    )
  }

  if (isBlockquote(token)) {
    return (
      <blockquote key={key} className="markdown-blockquote">
        {renderTokens(token.tokens)}
      </blockquote>
    )
  }

  if (isList(token)) {
    const listChildren = token.items.map((item, itemIdx) => (
      <li key={`item-${itemIdx}`} className="markdown-li">
        {item.task && (
          <input
            type="checkbox"
            checked={Boolean(item.checked)}
            readOnly
            className="markdown-task-checkbox"
          />
        )}
        {renderTokens(item.tokens)}
      </li>
    ))

    if (token.ordered) {
      const startNum = typeof token.start === 'number' ? token.start : undefined
      return (
        <ol key={key} start={startNum} className="markdown-ol">
          {listChildren}
        </ol>
      )
    }

    return (
      <ul key={key} className="markdown-ul">
        {listChildren}
      </ul>
    )
  }

  if (isTable(token)) {
    return (
      <div key={key} className="markdown-table-wrapper">
        <table className="markdown-table">
          <thead>
            <tr>
              {token.header.map((headCell, headIdx) => (
                <th
                  key={`th-${headIdx}`}
                  style={{ textAlign: headCell.align ?? 'left' }}
                  className="markdown-th"
                >
                  {renderTokens(headCell.tokens)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {token.rows.map((rowCells, rowIdx) => (
              <tr key={`tr-${rowIdx}`} className="markdown-tr">
                {rowCells.map((cell, colIdx) => (
                  <td
                    key={`td-${rowIdx}-${colIdx}`}
                    style={{ textAlign: cell.align ?? 'left' }}
                    className="markdown-td"
                  >
                    {renderTokens(cell.tokens)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (isHr(token)) {
    return <hr key={key} className="markdown-hr" />
  }

  if (isBr(token)) {
    return <br key={key} />
  }

  if (isLink(token)) {
    return (
      <a
        key={key}
        href={token.href}
        title={token.title ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="markdown-link"
      >
        {token.tokens && token.tokens.length > 0 ? renderTokens(token.tokens) : token.text}
      </a>
    )
  }

  if (isImage(token)) {
    return (
      <img
        key={key}
        src={token.href}
        alt={token.text}
        title={token.title ?? undefined}
        className="markdown-image"
        loading="lazy"
      />
    )
  }

  if (isCheckbox(token)) {
    return (
      <input
        key={key}
        type="checkbox"
        checked={token.checked}
        readOnly
        className="markdown-task-checkbox"
      />
    )
  }

  if (isText(token)) {
    if (token.tokens && token.tokens.length > 0) {
      return <React.Fragment key={key}>{renderTokens(token.tokens)}</React.Fragment>
    }
    return <React.Fragment key={key}>{token.text}</React.Fragment>
  }

  if (isEscape(token)) {
    return <React.Fragment key={key}>{token.text}</React.Fragment>
  }

  if (isHtml(token)) {
    return (
      <span key={key} className="markdown-html-fallback">
        {token.text}
      </span>
    )
  }

  if (isSpace(token)) {
    return null
  }

  // Dự phòng cho các token khác nếu có
  return 'raw' in token && typeof token.raw === 'string' ? (
    <React.Fragment key={key}>{token.raw}</React.Fragment>
  ) : null
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps): React.JSX.Element {
  const tokens = useMemo(() => {
    if (!content) return []
    return marked.lexer(content, { breaks: true, gfm: true })
  }, [content])

  return (
    <div className={`markdown-content ${className ? className : ''}`}>
      {renderTokens(tokens)}
    </div>
  )
}

export default MarkdownRenderer
