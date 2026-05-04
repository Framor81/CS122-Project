import { useEffect, useMemo, useState } from 'react'
import { Museum3DShell } from '../components/Museum3DShell.jsx'
import { supabase } from '../lib/supabaseClient.js'

function makeSessionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]
  }
  return out
}

const DEFAULT_MAP = { seedText: 'museum-seed-alpha', gridSize: 800 }

export function SessionGate({
  onSelectSession,
  userId,
  displayName,
  onNavigate,
  onNavigate3D,
  onSignOut,
}) {
  const [mode, setMode] = useState(null)
  const [joinCode, setJoinCode] = useState('')
  const [errorText, setErrorText] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const normalizedJoin = useMemo(
    () => joinCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12),
    [joinCode],
  )

  useEffect(() => {
    if (mode !== 'create') return
    let cancelled = false
    const createSession = async () => {
      if (!supabase || !userId) {
        if (!cancelled) setErrorText('Session creation is unavailable right now.')
        return
      }
      setErrorText('')
      setIsSubmitting(true)
      const sessionCode = makeSessionCode()
      const { error } = await supabase.from('museum_sessions').upsert(
        {
          session_code: sessionCode,
          seed_text: DEFAULT_MAP.seedText,
          grid_size: DEFAULT_MAP.gridSize,
          host_user_id: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_code' },
      )
      if (cancelled) return
      setIsSubmitting(false)
      if (error) {
        setErrorText('Could not create session. Please try again.')
        setMode(null)
        return
      }
      onSelectSession(sessionCode)
    }
    createSession()
    return () => {
      cancelled = true
    }
  }, [mode, onSelectSession, userId])

  const tryJoin = async () => {
    if (!normalizedJoin || isSubmitting) return
    if (!supabase) {
      setErrorText('Session lookup is unavailable right now.')
      return
    }
    setIsSubmitting(true)
    setErrorText('')
    const { data } = await supabase
      .from('museum_sessions')
      .select('session_code')
      .eq('session_code', normalizedJoin)
      .maybeSingle()
    setIsSubmitting(false)
    if (!data?.session_code) {
      setErrorText('Session not found')
      return
    }
    onSelectSession(normalizedJoin)
  }

  let main = null
  if (!mode) {
    main = (
      <main className="m3d-hero">
        <p className="m3d-eyebrow">Immersive experience</p>
        <h1 className="m3d-hero-title">3D Museum</h1>
        <div className="m3d-rule" aria-hidden />
        <p className="m3d-tagline">
          Step inside your collection. Walk through space, not just images.
        </p>
        <div className="m3d-cta-row">
          <button type="button" className="m3d-cta-link" onClick={() => setMode('create')}>
            Enter museum →
          </button>
          <span className="m3d-cta-divider" aria-hidden />
          <button type="button" className="m3d-cta-link" onClick={() => setMode('join')}>
            Join session →
          </button>
        </div>
      </main>
    )
  } else if (mode === 'create') {
    main = (
      <div className="m3d-card">
        <h2 className="m3d-card__title">Creating session</h2>
        <p className="m3d-card__hint">
          {isSubmitting ? 'Generating your session code…' : errorText || 'Please wait…'}
        </p>
        {!isSubmitting && errorText ? (
          <button type="button" className="m3d-card__btn m3d-card__btn--secondary" onClick={() => setMode(null)}>
            Back
          </button>
        ) : null}
      </div>
    )
  } else {
    main = (
      <div className="m3d-card">
        <h2 className="m3d-card__title">Join session</h2>
        <p className="m3d-card__hint">Enter the code you received from the host.</p>
        <label className="m3d-card__label" htmlFor="m3d-join-code">
          Session code
        </label>
        <input
          id="m3d-join-code"
          className="m3d-card__input"
          value={joinCode}
          onChange={(e) => {
            setJoinCode(e.target.value)
            setErrorText('')
          }}
          placeholder="ABC123"
          autoComplete="off"
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || !normalizedJoin || isSubmitting) return
            e.preventDefault()
            await tryJoin()
          }}
        />
        {errorText ? <p className="m3d-card__error">{errorText}</p> : null}
        <button type="button" className="m3d-card__btn" disabled={!normalizedJoin || isSubmitting} onClick={tryJoin}>
          {isSubmitting ? 'Checking…' : 'Enter session lobby →'}
        </button>
        <button
          type="button"
          className="m3d-card__btn m3d-card__btn--secondary"
          onClick={() => {
            setJoinCode('')
            setErrorText('')
            setIsSubmitting(false)
            setMode(null)
          }}
        >
          Back
        </button>
      </div>
    )
  }

  return (
    <Museum3DShell
      variant="hero"
      displayName={displayName}
      activeRoute=""
      onNavigate={onNavigate}
      onNavigate3D={onNavigate3D}
      onSignOut={onSignOut}
    >
      {main}
    </Museum3DShell>
  )
}
