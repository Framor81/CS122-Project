import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const DEFAULT_MAP = { seedText: 'museum-seed-alpha', gridSize: 800 }

function randomInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1))
}

function makeRandomMap() {
  return {
    seedText: `museum-seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    gridSize: randomInt(500, 2500),
  }
}

function normalizeMap(raw) {
  const seedText =
    raw && typeof raw.seedText === 'string' && raw.seedText.length > 0
      ? raw.seedText
      : DEFAULT_MAP.seedText
  const gridSizeRaw = raw?.gridSize ?? DEFAULT_MAP.gridSize
  const gridSize = Math.max(500, Math.min(2500, Math.floor(Number(gridSizeRaw) || 800)))
  return { seedText, gridSize }
}

export function useSharedMuseumMap(userId, sessionCode) {
  const [museumMap, setMuseumMap] = useState(DEFAULT_MAP)
  const [loading, setLoading] = useState(Boolean(supabase && userId))

  const saveUserMapSlot = useCallback(
    async (nextMap) => {
      if (!supabase || !userId || !sessionCode) return
      const slotKey = `museum3d.mapSlot.${userId}`
      const slot = Number(window.localStorage.getItem(slotKey) || '0') % 3
      await supabase.from('user_museums').upsert(
        {
          user_id: userId,
          slot,
          session_code: sessionCode,
          seed_text: nextMap.seedText,
          grid_size: nextMap.gridSize,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,slot' },
      )
      window.localStorage.setItem(slotKey, String((slot + 1) % 3))
    },
    [sessionCode, userId],
  )

  useEffect(() => {
    let mounted = true
    if (!supabase || !userId || !sessionCode) return

    const load = async () => {
      const { data } = await supabase
        .from('museum_sessions')
        .select('seed_text,grid_size')
        .eq('session_code', sessionCode)
        .maybeSingle()

      if (!mounted) return

      if (data?.seed_text && data?.grid_size) {
        setMuseumMap(normalizeMap({ seedText: data.seed_text, gridSize: data.grid_size }))
      } else {
        // Session creation is explicit from the "Generate Session Code" flow.
        // Unknown join codes should not auto-create a new session.
        setMuseumMap(DEFAULT_MAP)
      }

      setLoading(false)
    }

    load()

    const channel = supabase
      .channel(`museum-world-state-${sessionCode}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'museum_sessions' },
        (payload) => {
          const row = payload.new
          if (!row || row.session_code !== sessionCode) return
          setMuseumMap(
            normalizeMap({ seedText: row.seed_text, gridSize: row.grid_size }),
          )
        },
      )
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [sessionCode, userId])

  const regenerateMap = useCallback(async () => {
    const nextMap = makeRandomMap()
    setMuseumMap(nextMap)
    if (!supabase || !userId || !sessionCode) return

    await supabase.from('museum_sessions').upsert(
      {
        session_code: sessionCode,
        seed_text: nextMap.seedText,
        grid_size: nextMap.gridSize,
        host_user_id: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_code' },
    )
    await saveUserMapSlot(nextMap)
  }, [saveUserMapSlot, sessionCode, userId])

  return useMemo(
    () => ({ museumMap, loading, regenerateMap }),
    [museumMap, loading, regenerateMap],
  )
}

