import { useCallback, useId, useState } from 'react'
import './MuseumGate.css'
import { PageWhimsy } from './PageWhimsy.jsx'

type UsernameSetupGateProps = {
  onSave: (username: string) => Promise<{ error?: { message?: string } | null }>
  busy?: boolean
  error?: string
}

export function UsernameSetupGate({ onSave, busy = false, error = '' }: UsernameSetupGateProps) {
  const userId = useId()
  const [username, setUsername] = useState('')
  const [localError, setLocalError] = useState('')
  const [saving, setSaving] = useState(false)

  const canSubmit = username.trim().length > 0 && !busy && !saving

  const handleSave = useCallback(async () => {
    if (!canSubmit) return
    setSaving(true)
    setLocalError('')
    const result = await onSave(username.trim().slice(0, 24))
    if (result?.error) {
      setLocalError(result.error.message || 'Could not save username.')
      setSaving(false)
      return
    }
    setSaving(false)
  }, [canSubmit, onSave, username])

  return (
    <div className="museum-gate">
      <PageWhimsy />
      <div className="museum-gate__panel">
        <h1 className="museum-gate__title">Set your username</h1>
        <p className="museum-gate__hint">
          This is what other visitors see in multiplayer and museum spaces.
        </p>

        <label className="museum-gate__label" htmlFor={userId}>
          Username
        </label>
        <input
          id={userId}
          className="museum-gate__input"
          type="text"
          autoComplete="username"
          maxLength={24}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="How you'll appear in game"
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave()
          }}
        />

        {error || localError ? (
          <p className="museum-gate__error" role="status">
            {error || localError}
          </p>
        ) : null}

        <button
          type="button"
          className="museum-gate__button museum-gate__button--signup"
          disabled={!canSubmit}
          onClick={handleSave}
        >
          {saving || busy ? 'Saving...' : 'Save username'}
        </button>
      </div>
    </div>
  )
}
