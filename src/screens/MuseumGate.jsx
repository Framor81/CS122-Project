import './MuseumGate.css'
import { PageWhimsy } from './PageWhimsy.jsx'

export function MuseumGate({ onEnter, displayName }) {
  return (
    <div className="museum-gate">
      <PageWhimsy />
      <div className="museum-gate__panel">
        <h1 className="museum-gate__title">Welcome in!</h1>
        <p className="museum-gate__hint">
          Ready to enter as {displayName || 'Visitor'}?
        </p>
        <button
          type="button"
          className="museum-gate__button"
          onClick={onEnter}
        >
          Enter the museum
        </button>
      </div>
    </div>
  )
}
