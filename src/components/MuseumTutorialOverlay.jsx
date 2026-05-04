import { useCallback, useEffect, useState } from 'react'
import './MuseumTutorialOverlay.css'

const STORAGE_KEY = 'museum3d.ftue.walkthrough.v1'
const DISPLAY_MS = 15000

export function MuseumTutorialOverlay() {
  const [visible, setVisible] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      return !window.localStorage.getItem(STORAGE_KEY)
    } catch {
      return true
    }
  })

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      /* ignore */
    }
    setVisible(false)
  }, [])

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
