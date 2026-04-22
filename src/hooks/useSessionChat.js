import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { isDebugEnabled, subscribeDebug } from '../lib/debugBus.js'

function fallbackName(userId) {
  if (!userId) return 'Visitor'
  return `Visitor-${String(userId).slice(0, 6)}`
}

export function useSessionChat({ sessionCode, userId, displayName }) {
  const [messages, setMessages] = useState([])
  const [incomingToasts, setIncomingToasts] = useState([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [nameMap, setNameMap] = useState({})
  const lastSeenIdRef = useRef(0)

  const active = Boolean(supabase && sessionCode && userId)

  const resolveSenderName = useCallback(
    (row) => {
      if (row.user_id === userId) return displayName || 'You'
      return nameMap[row.user_id] || fallbackName(row.user_id)
    },
    [displayName, nameMap, userId],
  )

  const enrichRows = useCallback(
    (rows) =>
      rows.map((row) => ({
        ...row,
        senderName: resolveSenderName(row),
      })),
    [resolveSenderName],
  )

  useEffect(() => {
    setMessages((prev) =>
      prev.map((row) => ({
        ...row,
        senderName: resolveSenderName(row),
      })),
    )
  }, [nameMap, resolveSenderName])

  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!last?.id) return
    const nextId = Number(last.id)
    if (Number.isFinite(nextId) && nextId > lastSeenIdRef.current) {
      lastSeenIdRef.current = nextId
    }
  }, [messages])

  const loadDisplayNames = useCallback(
    async (rows) => {
      if (!supabase || !rows?.length) return
      const missingIds = Array.from(
        new Set(
          rows
            .map((r) => r.user_id)
            .filter((id) => id && id !== userId && !nameMap[id]),
        ),
      )
      if (!missingIds.length) return
      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', missingIds)
      if (!data?.length) return
      setNameMap((prev) => {
        const next = { ...prev }
        data.forEach((row) => {
          const fallbackFromEmail = row.email ? String(row.email).split('@')[0] : ''
          next[row.id] = row.display_name || fallbackFromEmail || fallbackName(row.id)
        })
        return next
      })
    },
    [nameMap, userId],
  )

  const appendRowsDeduped = useCallback(
    async (rows) => {
      if (!rows?.length) return
      await loadDisplayNames(rows)
      setMessages((prev) => {
        let next = [...prev]
        const seen = new Set(next.map((m) => String(m.id)))
        for (const row of rows) {
          const incomingId = String(row.id)
          if (seen.has(incomingId)) continue

          // Reconcile optimistic local echo: if this confirmed DB message matches
          // a pending local row from the same user with same text, replace it.
          const optimisticIdx = next.findIndex(
            (m) =>
              m.pending &&
              m.user_id === row.user_id &&
              String(m.message) === String(row.message),
          )
          if (optimisticIdx >= 0) {
            next.splice(optimisticIdx, 1)
          }

          next.push({ ...row, senderName: resolveSenderName(row) })
          seen.add(incomingId)
        }
        return next
      })
    },
    [loadDisplayNames, resolveSenderName],
  )

  useEffect(() => {
    if (!active) return
    let mounted = true

    const bootstrap = async () => {
      const { data, error: loadError } = await supabase
        .from('session_messages')
        .select('id, session_code, user_id, message, created_at')
        .eq('session_code', sessionCode)
        .order('created_at', { ascending: true })
        .limit(200)
      if (!mounted) return
      if (loadError) {
        setError(loadError.message || 'Failed to load chat.')
        return
      }
      const rows = data || []
      lastSeenIdRef.current = rows.length ? Number(rows[rows.length - 1].id) || 0 : 0
      await loadDisplayNames(rows)
      if (!mounted) return
      setMessages(enrichRows(rows))
      setError('')
    }

    bootstrap()

    const channel = supabase
      .channel(`session-chat-${sessionCode}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'session_messages',
          filter: `session_code=eq.${sessionCode}`,
        },
        async (payload) => {
          const row = payload.new
          if (!row) return
          await appendRowsDeduped([row])
          const enriched = { ...row, senderName: resolveSenderName(row) }
          if (row.user_id !== userId) {
            setIncomingToasts((prev) => [
              ...prev,
              {
                id: `${row.id}-${Date.now()}`,
                text: `${enriched.senderName}: ${row.message}`,
              },
            ])
          }
        },
      )
      .subscribe()

    // Fallback path: poll incremental rows in case realtime is unavailable.
    const poll = window.setInterval(async () => {
      const sinceId = lastSeenIdRef.current
      const query = supabase
        .from('session_messages')
        .select('id, session_code, user_id, message, created_at')
        .eq('session_code', sessionCode)
        .order('id', { ascending: true })
        .limit(200)
      const { data, error: pollError } =
        sinceId > 0 ? await query.gt('id', sinceId) : await query
      if (pollError || !data?.length) return
      await appendRowsDeduped(data)
    }, 2500)

    return () => {
      mounted = false
      window.clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [active, appendRowsDeduped, enrichRows, loadDisplayNames, resolveSenderName, sessionCode, userId])

  useEffect(() => {
    if (!incomingToasts.length) return
    const timer = window.setTimeout(() => {
      setIncomingToasts((prev) => prev.slice(1))
    }, 4200)
    return () => window.clearTimeout(timer)
  }, [incomingToasts])

  // Local-only debug feed: when ?debug=1 (etc.) is set, surface debugReport()
  // events into the chat so issues are visible in-game.
  useEffect(() => {
    const seenDebug = new Set()
    const unsub = subscribeDebug((event) => {
      if (!isDebugEnabled()) return
      if (seenDebug.has(event.id)) return
      seenDebug.add(event.id)
      const debugRow = {
        id: `debug-${event.id}`,
        session_code: sessionCode || 'local',
        user_id: '__debug__',
        message: event.text,
        created_at: new Date(event.at || Date.now()).toISOString(),
        senderName: `[debug${event.kind && event.kind !== 'info' ? `:${event.kind}` : ''}]`,
        debug: true,
      }
      setMessages((prev) => [...prev, debugRow])
      setIncomingToasts((prev) => [
        ...prev,
        { id: `${debugRow.id}-toast`, text: `${debugRow.senderName} ${event.text}` },
      ])
    })
    return () => {
      unsub?.()
    }
  }, [sessionCode])

  const sendMessage = useCallback(
    async (text) => {
      if (!active) return { error: 'Chat unavailable.' }
      const trimmed = String(text || '').trim()
      if (!trimmed) return { error: null }
      const optimisticId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const optimisticRow = {
        id: optimisticId,
        session_code: sessionCode,
        user_id: userId,
        message: trimmed.slice(0, 500),
        created_at: new Date().toISOString(),
        senderName: displayName || 'You',
        pending: true,
      }
      setMessages((prev) => [...prev, optimisticRow])
      setSending(true)
      setError('')
      try {
        const { error: insertError } = await supabase.from('session_messages').insert({
          session_code: sessionCode,
          user_id: userId,
          message: trimmed.slice(0, 500),
        })
        if (insertError) {
          setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
          setError(insertError.message || 'Failed to send message.')
          return { error: insertError.message || 'Failed to send message.' }
        }
        return { error: null }
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId))
        const message = err instanceof Error ? err.message : 'Failed to send message.'
        setError(message)
        return { error: message }
      } finally {
        setSending(false)
      }
    },
    [active, displayName, sessionCode, userId],
  )

  return useMemo(
    () => ({
      active,
      messages,
      incomingToasts,
      sending,
      error,
      sendMessage,
    }),
    [active, error, incomingToasts, messages, sendMessage, sending],
  )
}

