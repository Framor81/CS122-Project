import { useEffect, useState } from 'react'

export function ScoreboardOverlay({ players }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'Tab') return
      event.preventDefault()
      setShow(true)
    }
    const onKeyUp = (event) => {
      if (event.code !== 'Tab') return
      event.preventDefault()
      setShow(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  if (!show) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 60,
        minWidth: 220,
        maxWidth: 320,
        padding: '12px 14px',
        borderRadius: 12,
        background: 'rgba(53, 33, 33, 0.72)',
        border: '1px solid rgba(255,255,255,0.25)',
        color: '#fff7f2',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 8 }}>
        Lobby ({players.length})
      </div>
      {players.map((name, idx) => (
        <div
          key={`${name}-${idx}`}
          style={{
            padding: '3px 0',
            borderBottom:
              idx < players.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
            fontSize: 14,
          }}
        >
          {name}
        </div>
      ))}
    </div>
  )
}
