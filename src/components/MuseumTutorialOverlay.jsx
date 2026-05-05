import { useCallback, useEffect, useMemo, useState } from 'react'
import './MuseumTutorialOverlay.css'

const STORAGE_KEY_PREFIX = 'museum3d.ftue.walkthrough.v2'
const DISPLAY_MS = 15000

export function MuseumTutorialOverlay({ sessionCode = '' }) {
  const storageKey = useMemo(() => {
    const safeSession = String(sessionCode || '').trim().toUpperCase() || 'GLOBAL'
    return `${STORAGE_KEY_PREFIX}:${safeSession}`
  }, [sessionCode])

  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return !window.localStorage.getItem(storageKey)
    } catch {
      return true
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      setVisible(!window.localStorage.getItem(storageKey))
    } catch {
      setVisible(true)
    }
  }, [storageKey])

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }, [storageKey])

  useEffect(() => {
    if (!visible) return undefined
    const t = window.setTimeout(dismiss, DISPLAY_MS)
    return () => window.clearTimeout(t)
  }, [visible, dismiss])

  if (!visible) return null

  return (
    <div className="museum-tutorial-overlay" role="dialog" aria-labelledby="museum-tutorial-title">
      <div className="museum-tutorial-overlay__panel">
        <p id="museum-tutorial-title" className="museum-tutorial-overlay__title">
          Welcome
        </p>
        <ul className="museum-tutorial-overlay__list">
          <li>
            <strong>WASD</strong> or <strong>arrow keys</strong> to move
          </li>
          <li>
            Hold <strong>Shift</strong> to run
          </li>
          <li>Look around with your mouse!</li>
          <li>Explore the museum — enjoy the collection</li>
        </ul>
        <p className="museum-tutorial-overlay__hint">The same reminder is painted on the floor where you arrive.</p>
        <button type="button" className="museum-tutorial-overlay__dismiss" onClick={dismiss}>
          Continue
        </button>
      </div>
    </div>
  )
}
