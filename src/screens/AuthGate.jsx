import { useCallback, useId, useState } from 'react'
import './MuseumGate.css'
import { PageWhimsy } from './PageWhimsy.jsx'

export function AuthGate({ hasConfig, onSignIn, onSignUp, error }) {
  const emailId = useId()
  const userId = useId()
  const passId = useId()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('signin')
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')

  const canSubmit =
    username.trim().length > 0 &&
    email.trim().length > 3 &&
    password.length >= 6 &&
    !busy

  const submit = useCallback(async () => {
    if (!canSubmit) return
    setBusy(true)
    setLocalError('')
    const fn = mode === 'signin' ? onSignIn : onSignUp
    const { error: authError } = await fn(email.trim(), password, username.trim())
    if (authError) setLocalError(authError.message || 'Authentication failed.')
    setBusy(false)
  }, [canSubmit, email, mode, onSignIn, onSignUp, password, username])

  return (
    <div className="museum-gate">
      <PageWhimsy />
      <div className="museum-gate__panel">
        <div className="museum-gate__title-row">
          <h1 className="museum-gate__title">Sign In</h1>
          <span className="museum-gate__info-wrap">
            <button
              type="button"
              className="museum-gate__info-icon"
              aria-label="How your email and password are handled"
            >
              i
            </button>
            <span className="museum-gate__info-tooltip" role="note">
              We only use your email for login and account identity.
              {' '}
              Your password is handled securely by Supabase and is not visible to us.
            </span>
          </span>
        </div>
        <p className="museum-gate__hint">
          Simple email login for saved museums and shared maps.
        </p>

        {!hasConfig ? (
          <p className="museum-gate__error" role="status">
            Missing Supabase env vars. Set `NEXT_PUBLIC_SUPABASE_URL` and
            `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`.
          </p>
        ) : null}

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
        />

        <label className="museum-gate__label" htmlFor={emailId}>
          Email
        </label>
        <input
          id={emailId}
          className="museum-gate__input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        <label className="museum-gate__label" htmlFor={passId} style={{ marginTop: 12 }}>
          Password
        </label>
        <input
          id={passId}
          className="museum-gate__input"
          type="password"
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 6 characters"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />

        {error || localError ? (
          <p className="museum-gate__error" role="status">
            {error || localError}
          </p>
        ) : null}

        <button
          type="button"
          className={`museum-gate__button ${mode === 'signup' ? 'museum-gate__button--signup' : ''}`}
          disabled={!canSubmit || !hasConfig}
          onClick={submit}
        >
          {busy
            ? 'Please wait...'
            : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
        </button>

        <button
          type="button"
          className="museum-gate__button"
          style={{ marginTop: 10 }}
          onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
          disabled={busy}
        >
          {mode === 'signin' ? 'Need an account? Sign up' : 'Have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}

