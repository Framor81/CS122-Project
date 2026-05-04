import { useEffect, useRef, useState } from 'react'
import './SessionChat.css'

export function SessionChat({
  chat,
  side = 'right',
  top = 110,
  width = 320,
  maxHeight = 320,
  onOpenChange,
  showEnterHint = true,
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

  const panelPosition = {
    position: 'fixed',
    [side]: 16,
    top,
    width,
    maxHeight,
  }

  const sidePosition = {
    position: 'fixed',
    [side]: 20,
    top: isOpen ? top + maxHeight + 10 : top,
    maxWidth: Math.min(width + 40, 420),
  }

  return (
    <>
      {isOpen ? (
        <div className="session-chat-panel" style={panelPosition}>
          <div className="session-chat-panel__header">Session chat · Esc to close</div>
          <div
            ref={scrollRef}
            className="session-chat-panel__scroll"
            style={{ maxHeight: maxHeight - 86 }}
          >
            {safeChat.messages.length ? (
              safeChat.messages.map((m) => (
                <div key={m.id} className="session-chat-panel__row">
                  <span className="session-chat-panel__sender">{m.senderName}</span>
                  <span className="session-chat-panel__body">{': '}{m.message}</span>
                </div>
              ))
            ) : (
              <div className="session-chat-panel__empty">No messages yet.</div>
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
              className="session-chat-panel__input"
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
            />
          </form>
          {safeChat.error ? (
            <div className="session-chat-panel__error">{safeChat.error}</div>
          ) : null}
        </div>
      ) : null}

      <div className="session-chat-side" style={sidePosition}>
        {!isOpen && showEnterHint ? (
          <div className="session-chat-side__hint">Press Enter to chat</div>
        ) : null}
        {safeChat.incomingToasts.slice(-3).map((toast) => (
          <div key={toast.id} className="session-chat-side__toast">
            {toast.text}
          </div>
        ))}
        {!isOpen
          ? safeChat.messages.slice(-4).map((m) => (
              <div key={`peek-${m.id}`} className="session-chat-side__peek">
                {m.senderName}: {m.message}
              </div>
            ))
          : null}
      </div>
    </>
  )
}
