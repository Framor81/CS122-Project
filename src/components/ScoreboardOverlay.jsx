import { useEffect, useState } from 'react'

export function ScoreboardOverlay({ players, showCombatStats }) {
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
        Lobby ({Array.isArray(players) ? players.length : 0})
      </div>
      {(Array.isArray(players) ? players : []).map((row, idx) => (
        <div
          key={`${typeof row === 'object' && row !== null && 'id' in row ? row.id : row}-${idx}`}
          style={{
            padding: '3px 0',
            borderBottom:
              idx < players.length - 1 ? '1px solid rgba(255,255,255,0.12)' : 'none',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span>
            {typeof row === 'string'
              ? row
              : row?.name ?? (row?.id != null ? String(row.id) : 'Visitor')}
          </span>
          {showCombatStats ? (
            <span style={{ opacity: 0.9, fontSize: 12 }}>
              {typeof row === 'string'
                ? ''
                : `${row.kills ?? 0}/${row.deaths ?? 0}`}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
