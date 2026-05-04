import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { debugReport } from '../lib/debugBus.js'

async function attachSignedUrls(rows) {
  if (!supabase) return []
  return Promise.all(
    (rows || []).map(async (art) => {
      if (!art.image_path) return { ...art, imageUrl: '' }
      const { data, error } = await supabase.storage
        .from('artworks')
        .createSignedUrl(art.image_path, 60 * 60)
      return { ...art, imageUrl: error ? '' : data?.signedUrl || '' }
    }),
  )
}

function normalizeScope(value) {
  return value === 'all' ? 'all' : 'host'
}

export function useSessionArtworks({ sessionCode, userId }) {
  const [loading, setLoading] = useState(Boolean(supabase && sessionCode && userId))
  const [error, setError] = useState('')
  const [artworks, setArtworks] = useState([])
  const [scope, setScopeState] = useState('host')
  const [hostUserId, setHostUserId] = useState('')

  const isHost = Boolean(userId && hostUserId && userId === hostUserId)

  const load = useCallback(async () => {
    if (!supabase || !sessionCode || !userId) {
      setLoading(false)
      setArtworks([])
      return
    }
    setLoading(true)
    setError('')

    let nextHost = ''
    let nextScope = 'host'
    let sessionErr = null

    const { data: sessionWithScope, error: scopeError } = await supabase
      .from('museum_sessions')
      .select('host_user_id, artwork_scope')
      .eq('session_code', sessionCode)
      .maybeSingle()
    if (scopeError) {
      // Backward-compatible fallback for DBs that do not have artwork_scope yet.
      const { data: sessionBasic, error: basicError } = await supabase
        .from('museum_sessions')
        .select('host_user_id')
        .eq('session_code', sessionCode)
        .maybeSingle()
      sessionErr = basicError
      nextHost = sessionBasic?.host_user_id || ''
      nextScope = 'host'
    } else {
      sessionErr = null
      nextHost = sessionWithScope?.host_user_id || ''
      nextScope = normalizeScope(sessionWithScope?.artwork_scope)
    }

    if (sessionErr) {
      const message = sessionErr.message || 'Failed to load session artwork settings.'
      setError(message)
      setArtworks([])
      setLoading(false)
      return
    }

    setHostUserId(nextHost)
    setScopeState(nextScope)

    const query = supabase
      .from('artworks')
      .select(
        'id,user_id,title,artist,period,date_text,medium,dimensions,location_guess,description,themes,image_path,status,updated_at,created_at',
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(nextScope === 'all' ? 200 : 120)

    const { data: rows, error: artworkError } =
      nextScope === 'all'
        ? await query
        : await query.eq('user_id', nextHost || userId)

    if (artworkError) {
      const message = artworkError.message || 'Could not load session artworks.'
      setError(message)
      setArtworks([])
      setLoading(false)
      debugReport(`Session artworks query failed: ${message}`, 'error')
      return
    }

    const withUrls = await attachSignedUrls(rows || [])
    const final = withUrls
      .filter((art) => art.imageUrl)
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    setArtworks(final)
    setLoading(false)
  }, [sessionCode, userId])

  useEffect(() => {
    queueMicrotask(() => {
      load()
    })
  }, [load])

  useEffect(() => {
    if (!supabase || !sessionCode || !userId) return undefined
    const channel = supabase
      .channel(`session-artworks-${sessionCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'museum_sessions' },
        (payload) => {
          const row = payload?.new
          if (!row || row.session_code !== sessionCode) return
          load()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'artworks' },
        () => {
          load()
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [load, sessionCode, userId])

  const setScope = useCallback(
    async (nextScopeRaw) => {
      const nextScope = normalizeScope(nextScopeRaw)
      if (!supabase || !sessionCode || !isHost) return { error: 'Only the host can change this.' }
      const { error: upsertError } = await supabase
        .from('museum_sessions')
        .update({ artwork_scope: nextScope, updated_at: new Date().toISOString() })
        .eq('session_code', sessionCode)
        .eq('host_user_id', userId)
      if (upsertError) {
        return { error: upsertError.message || 'Failed to update artwork mode.' }
      }
      setScopeState(nextScope)
      await load()
      return { error: null }
    },
    [isHost, load, sessionCode, userId],
  )

  return useMemo(
    () => ({
      artworks,
      loading,
      error,
      scope,
      hostUserId,
      isHost,
      setScope,
      reload: load,
    }),
    [artworks, loading, error, scope, hostUserId, isHost, setScope, load],
  )
}
