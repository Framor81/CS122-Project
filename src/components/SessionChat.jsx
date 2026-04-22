import { useEffect, useRef, useState } from 'react'

export function SessionChat({
  chat,
  side = 'right',
  top = 110,
  width = 320,
  maxHeight = 320,
  onOpenChange,
}) {
  const safeChat = chat || {
    active: false,
    messages: [],
    incomingToasts: [],
    sending: false,
    error: '',
    sendMessage: async () => ({ error: 'Chat unavailable.' }),
  }
  const [draft, setDraft] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const tryRelockPointer = () => {
    if (typeof document === 'undefined') return
    if (document.pointerLockElement) return
    const el = document.body
    if (el && typeof el.requestPointerLock === 'function') {
      el.requestPointerLock()
    }
  }
  const closeChat = (relock = false) => {
    setIsOpen(false)
    if (relock) {
      window.setTimeout(() => {
        tryRelockPointer()
      }, 0)
    }
  }
  const submitMessage = async () => {
    const text = draft.trim()
    if (!text) {
      closeChat(true)
      return
    }
    const result = await safeChat.sendMessage(text)
    if (!result.error) {
      setDraft('')
      closeChat(true)
    }
  }

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [safeChat.messages.length])

  useEffect(() => {
    if (!isOpen) return
    if (document.pointerLockElement) document.exitPointerLock()
    inputRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    onOpenChange?.(isOpen)
  }, [isOpen, onOpenChange])

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        closeChat(true)
        return
      }
      if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target
      const tag = target?.tagName?.toLowerCase?.() || ''
      const isEditable =
        tag === 'input' ||
        tag === 'textarea' ||
        target?.isContentEditable
      if (isEditable) return
      e.preventDefault()
      if (document.pointerLockElement) document.exitPointerLock()
      setIsOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen])

  const panelStyle = {
    position: 'fixed',
    [side]: 16,
    top,
    zIndex: 120,
    width,
    maxHeight,
    background: 'rgba(10, 10, 10, 0.52)',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: 10,
    backdropFilter: 'blur(3px)',
    color: '#f6eee8',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }

  return (
    <>
      {isOpen ? (
        <div style={panelStyle}>
          <div
            style={{
              padding: '8px 10px',
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255, 244, 235, 0.78)',
              borderBottom: '1px solid rgba(255,255,255,0.14)',
            }}
          >
            Session Chat (Esc to close)
          </div>
          <div
            ref={scrollRef}
            style={{
              padding: '8px 10px',
              overflowY: 'auto',
              minHeight: 100,
              maxHeight: maxHeight - 86,
              fontSize: 12,
              lineHeight: 1.4,
            }}
          >
            {safeChat.messages.length ? (
              safeChat.messages.map((m) => (
                <div key={m.id} style={{ marginBottom: 5, wordBreak: 'break-word' }}>
                  <span style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 600 }}>
                    {m.senderName}
                  </span>
                  {': '}
                  <span style={{ color: 'rgba(255,255,255,0.88)' }}>{m.message}</span>
                </div>
              ))
            ) : (
              <div style={{ color: 'rgba(255,255,255,0.58)' }}>No messages yet.</div>
            )}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submitMessage()
            }}
          >
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={safeChat.active ? 'Type and press Enter…' : 'Chat unavailable'}
              disabled={!safeChat.active || safeChat.sending}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  closeChat(true)
                  return
                }
                if (e.key === 'Enter') {
                  e.stopPropagation()
                }
              }}
              style={{
                border: 'none',
                borderTop: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(12,12,12,0.7)',
                color: '#fff',
                padding: '9px 10px',
                fontSize: 12,
                outline: 'none',
                width: '100%',
              }}
            />
          </form>
          {safeChat.error ? (
            <div
              style={{
                padding: '6px 10px 8px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                color: '#ffccc7',
                fontSize: 11,
                lineHeight: 1.3,
              }}
            >
              {safeChat.error}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Lightweight side notifications: plain text with no box */}
      <div
        style={{
          position: 'fixed',
          [side]: 20,
          top: isOpen ? top + maxHeight + 10 : top,
          zIndex: 122,
          maxWidth: Math.min(width + 40, 420),
          pointerEvents: 'none',
        }}
      >
        {!isOpen ? (
          <div
            style={{
              marginBottom: 8,
              color: 'rgba(255,255,255,0.62)',
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Press Enter to chat
          </div>
        ) : null}
        {safeChat.incomingToasts.slice(-3).map((toast) => (
          <div
            key={toast.id}
            style={{
              marginBottom: 6,
              color: 'rgba(255, 248, 240, 0.96)',
              textShadow: '0 2px 10px rgba(0,0,0,0.6)',
              fontSize: 13,
              lineHeight: 1.35,
              wordBreak: 'break-word',
            }}
          >
            {toast.text}
          </div>
        ))}
        {!isOpen
          ? safeChat.messages.slice(-4).map((m) => (
              <div
                key={`peek-${m.id}`}
                style={{
                  marginBottom: 4,
                  color: 'rgba(255, 248, 240, 0.9)',
                  textShadow: '0 2px 10px rgba(0,0,0,0.6)',
                  fontSize: 12,
                  lineHeight: 1.3,
                  wordBreak: 'break-word',
                }}
              >
                {m.senderName}: {m.message}
              </div>
            ))
          : null}
      </div>
    </>
  )
}

