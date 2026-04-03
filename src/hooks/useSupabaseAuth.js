import { useCallback, useEffect, useState } from 'react'
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient.js'

export function useSupabaseAuth() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(hasSupabaseConfig)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) return

    let active = true
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      if (sessionError) setError(sessionError.message)
      setSession(data?.session ?? null)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email, password, username) => {
    if (!supabase) return { error: { message: 'Supabase not configured.' } }
    setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (!authError && username && data?.session?.user) {
      await supabase.auth.updateUser({
        data: { username: username.trim().slice(0, 24) },
      })
    }
    if (authError) setError(authError.message)
    return { error: authError }
  }, [])

  const signUp = useCallback(async (email, password, username) => {
    if (!supabase) return { error: { message: 'Supabase not configured.' } }
    setError('')
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: (username || '').trim().slice(0, 24),
        },
      },
    })
    if (authError) setError(authError.message)
    return { error: authError }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    setError('')
    try {
      await supabase.auth.signOut()
      setSession(null)
      return
    } catch (err) {
      // Network failures can break global sign-out requests; fall back to local sign-out
      // so the user is still signed out on this device.
      const { error: localError } = await supabase.auth.signOut({ scope: 'local' })
      if (localError) {
        setError(localError.message || 'Failed to sign out.')
      } else {
        setSession(null)
      }
      if (!localError && err) {
        setError('Signed out locally (network issue while contacting auth server).')
      }
    }
  }, [])

  return {
    session,
    user: session?.user ?? null,
    loading,
    error,
    hasSupabaseConfig,
    signIn,
    signUp,
    signOut,
  }
}

