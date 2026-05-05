import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** PostgREST when `artwork_scope` is missing from the DB or schema cache. */
function missingArtworkScopeMessage() {
  return (
    'The database is missing the artwork_scope column on museum_sessions. ' +
    'In Supabase → SQL Editor, run supabase/session-artwork-scope.patch.sql (or apply supabase/migrations/20260503120000_add_museum_sessions_artwork_scope.sql). ' +
    "Then run: NOTIFY pgrst, 'reload schema'; — or wait a minute and retry."
  )
}

function isArtworkScopeSchemaError(err) {
  const m = (err && (err.message || err.details || err.hint)) || ''
  return (
    /artwork_scope/i.test(m) ||
    /schema cache/i.test(m) ||
    /PGRST204/i.test(m)
  )
}

export function useSessionArtworks({
  sessionCode,
  userId,
  connectedUserIds = null,
  onHostUserIdResolved,
} = {}) {
  const [loading, setLoading] = useState(Boolean(supabase && sessionCode && userId))
  const [error, setError] = useState('')
  const [artworks, setArtworks] = useState([])
  const [scope, setScopeState] = useState('host')
  const [hostUserId, setHostUserId] = useState('')
  const hostResolvedCbRef = useRef(onHostUserIdResolved)
  hostResolvedCbRef.current = onHostUserIdResolved

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

    if (nextHost && typeof hostResolvedCbRef.current === 'function') {
      hostResolvedCbRef.current(nextHost)
    }

    const fromPresence =
      Array.isArray(connectedUserIds) && connectedUserIds.length > 0
        ? [...new Set(connectedUserIds.map((x) => String(x ?? '').trim()).filter(Boolean))]
        : []
    const fallbackIds = [
      ...new Set(
        [nextHost || '', userId || '']
          .map((x) => String(x ?? '').trim())
          .filter(Boolean),
      ),
    ]
    const poolUserIdsForAllScope = fromPresence.length > 0 ? fromPresence : fallbackIds

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
        ? await query.in('user_id', poolUserIdsForAllScope)
        : await query.eq('user_id', nextHost || userId)

    if (artworkError) {
      const message = isArtworkScopeSchemaError(artworkError)
        ? missingArtworkScopeMessage()
        : artworkError.message || 'Could not load session artworks.'
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
  }, [sessionCode, userId, connectedUserIds])

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
      if (!supabase || !sessionCode || !userId) {
        return { error: 'Session is not ready.' }
      }
      if (!isHost) {
        return { error: 'Only the host can change this.' }
      }
      // Update must match exactly one row. Supabase returns no error when 0 rows match,
      // which would leave the DB on "host" while the UI optimistically flips—then load()
      // would snap the dropdown back.
      const { data, error: updateError } = await supabase
        .from('museum_sessions')
        .update({ artwork_scope: nextScope, updated_at: new Date().toISOString() })
        .eq('session_code', sessionCode)
        .eq('host_user_id', userId)
        .select('artwork_scope')

      if (updateError) {
        if (isArtworkScopeSchemaError(updateError)) {
          return { error: missingArtworkScopeMessage() }
        }
        return { error: updateError.message || 'Failed to update artwork mode.' }
      }
      if (!data?.length) {
        return {
          error:
            'Could not update this session. If you created the room, try refreshing; the host record may be out of sync.',
        }
      }
      setScopeState(normalizeScope(data[0].artwork_scope))
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
