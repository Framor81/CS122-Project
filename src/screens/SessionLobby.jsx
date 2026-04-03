import { useMemo, useState } from 'react'
import { useMultiplayer } from '../hooks/useMultiplayer.js'
import './MuseumGate.css'
import { PageWhimsy } from './PageWhimsy.jsx'

export function SessionLobby({ displayName, sessionCode, onEnterMuseum }) {
  const multiplayer = useMultiplayer(displayName, sessionCode)
  const [copied, setCopied] = useState(false)

  const playerNames = useMemo(() => {
    const names = [displayName, ...Object.values(multiplayer.remotePlayers).map((p) => p?.name || 'Visitor')]
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
  }, [displayName, multiplayer.remotePlayers])

  const shareLink = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/session/${sessionCode}`
  }, [sessionCode])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="museum-gate">
      <PageWhimsy />
      <div className="museum-gate__session-layout">
        <section className="museum-gate__session-box museum-gate__session-box--main">
          <h1 className="museum-gate__title">Session Lobby</h1>
          <p className="museum-gate__hint museum-gate__session-line" style={{ marginBottom: 10 }}>
            Session code:
            {' '}
            <strong>{sessionCode}</strong>
            <button
              type="button"
              className="museum-gate__copy-icon"
              aria-label="Copy session link"
              onClick={copyLink}
              title="Copy session link"
            >
              {copied ? '✓' : '⧉'}
            </button>
          </p>
          <button
            type="button"
            className="museum-gate__button"
            style={{ marginTop: 14 }}
            onClick={onEnterMuseum}
          >
            Enter the museum
          </button>
        </section>
        <section className="museum-gate__session-box museum-gate__session-box--people">
          <div className="museum-gate__label" style={{ marginBottom: 8 }}>
            People in this server ({playerNames.length})
          </div>
          <div
            className="museum-gate__input"
            style={{ padding: '8px 10px', maxHeight: 280, overflowY: 'auto' }}
          >
            {playerNames.map((name, idx) => (
              <div
                key={`${name}-${idx}`}
                style={{
                  padding: '4px 0',
                  fontSize: 13,
                  borderBottom: '1px solid rgba(0,0,0,0.08)',
                }}
              >
                {name}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

