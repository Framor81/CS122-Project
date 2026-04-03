import { useEffect, useMemo, useState } from 'react'
import './MuseumGate.css'
import { PageWhimsy } from './PageWhimsy.jsx'
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

export function SessionGate({ onSelectSession, userId }) {
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

  if (!mode) {
    return (
      <div className="museum-gate">
        <PageWhimsy />
        <div className="museum-gate__panel">
          <h1 className="museum-gate__title">Session Lobby</h1>
          <p className="museum-gate__hint">Create a session code or join an existing one.</p>
          <button className="museum-gate__button" onClick={() => setMode('create')} type="button">
            Generate Session Code
          </button>
          <button
            className="museum-gate__button"
            style={{ marginTop: 10 }}
            onClick={() => setMode('join')}
            type="button"
          >
            Join Session
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'create') {
    return (
      <div className="museum-gate">
        <PageWhimsy />
        <div className="museum-gate__panel">
          <h1 className="museum-gate__title">Creating Session</h1>
          <p className="museum-gate__hint">
            {isSubmitting ? 'Generating your session code...' : errorText || 'Please wait...'}
          </p>
          {!isSubmitting && errorText ? (
            <button className="museum-gate__button" type="button" onClick={() => setMode(null)}>
              Back
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="museum-gate">
      <PageWhimsy />
      <div className="museum-gate__panel">
        <h1 className="museum-gate__title">Join Session</h1>
        <label className="museum-gate__label">Session code</label>
        <input
          className="museum-gate__input"
          value={joinCode}
          onChange={(e) => {
            setJoinCode(e.target.value)
            setErrorText('')
          }}
          placeholder="ABC123"
          onKeyDown={async (e) => {
            if (e.key !== 'Enter' || !normalizedJoin || isSubmitting) return
            if (!supabase) {
              setErrorText('Session lookup is unavailable right now.')
              return
            }
            setIsSubmitting(true)
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
          }}
        />
        {errorText ? (
          <p className="museum-gate__hint" style={{ color: '#ffd0c7' }}>
            {errorText}
          </p>
        ) : null}
        <button
          className="museum-gate__button"
          type="button"
          disabled={!normalizedJoin || isSubmitting}
          onClick={async () => {
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
          }}
        >
          {isSubmitting ? 'Checking...' : 'Enter Session Lobby'}
        </button>
        <button
          className="museum-gate__button"
          style={{ marginTop: 10 }}
          type="button"
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
    </div>
  )
}

