import { useEffect, useMemo, useState } from 'react'
import { Museum3DShell } from '../components/Museum3DShell.jsx'
import { supabase } from '../lib/supabaseClient.js'

function makeSessionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  let out = ''
  for (let i = 0; i < 4; i += 1) {
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
    () => joinCode.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4),
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
      let sessionCode = ''
      let error = null
      for (let attempt = 0; attempt < 8; attempt += 1) {
        sessionCode = makeSessionCode()
        const res = await supabase.from('museum_sessions').insert({
          session_code: sessionCode,
          seed_text: DEFAULT_MAP.seedText,
          grid_size: DEFAULT_MAP.gridSize,
          host_user_id: userId,
          updated_at: new Date().toISOString(),
        })
        if (!res.error) {
          error = null
          break
        }
        // Unique conflict (code already taken): retry a new 4-char code.
        if (res.error.code === '23505') {
          error = res.error
          continue
        }
        error = res.error
        break
      }
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
          placeholder="ABCD"
          maxLength={4}
          autoComplete="off"
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || normalizedJoin.length !== 4 || isSubmitting) return
            e.preventDefault()
            await tryJoin()
          }}
        />
        {errorText ? <p className="m3d-card__error">{errorText}</p> : null}
        <button
          type="button"
          className="m3d-card__btn"
          disabled={normalizedJoin.length !== 4 || isSubmitting}
          onClick={tryJoin}
        >
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
