import { useCallback, useId, useState } from 'react'
import './MuseumGate.css'

export function MuseumGate({ onEnter }) {
  const labelId = useId()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const canEnter = value.trim().length > 0

  const submit = useCallback(() => {
    const name = value.trim()
    if (!name) {
      setError('Please enter a name.')
      return
    }
    setError('')
    onEnter(name)
  }, [value, onEnter])

  return (
    <div className="museum-gate">
      <div className="museum-gate__panel">
        <h1 className="museum-gate__title">Welcome in!</h1>
        <p className="museum-gate__hint">
          Pick a nickname, so your friends can find you!
        </p>
        <label className="museum-gate__label" htmlFor={labelId}>
          Who are you?
        </label>
        <input
          id={labelId}
          className="museum-gate__input"
          type="text"
          autoComplete="nickname"
          maxLength={24}
          value={value}
          placeholder="(Enter a name before entering!)"
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError('')
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canEnter) submit()
          }}
        />
        {error ? (
          <p className="museum-gate__error" role="status">
            {error}
          </p>
        ) : null}
        <button
          type="button"
          className="museum-gate__button"
          disabled={!canEnter}
          onClick={submit}
        >
          Enter the museum
        </button>
      </div>
    </div>
  )
}
