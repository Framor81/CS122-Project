import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

async function attachSignedUrls(rows) {
  if (!supabase) return []
  return Promise.all(
    rows.map(async (art) => {
      if (!art.image_path) return { ...art, imageUrl: '' }
      const { data, error } = await supabase.storage
        .from('artworks')
        .createSignedUrl(art.image_path, 60 * 60)
      return {
        ...art,
        imageUrl: error ? '' : data?.signedUrl || '',
      }
    }),
  )
}

export function useUserArtworks(userId) {
  const [resolvedUserId, setResolvedUserId] = useState(userId || null)
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(Boolean(supabase && userId))
  const [error, setError] = useState('')

  const loadArtworks = useCallback(async () => {
    if (!supabase) {
      setArtworks([])
      setLoading(false)
      return
    }

    let ownerId = userId || resolvedUserId
    if (!ownerId) {
      const { data } = await supabase.auth.getUser()
      ownerId = data?.user?.id || null
      setResolvedUserId(ownerId)
    }

    if (!ownerId) {
      setArtworks([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('artworks')
      .select('id,title,artist,date_text,themes,image_path,status,updated_at,created_at')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(48)

    if (queryError) {
      setError(queryError.message || 'Could not load artworks.')
      setArtworks([])
      setLoading(false)
      return
    }

    const withUrls = await attachSignedUrls(data || [])
    setArtworks(withUrls.filter((art) => art.imageUrl))
    setLoading(false)
  }, [resolvedUserId, userId])

  useEffect(() => {
    queueMicrotask(() => {
      loadArtworks()
    })
  }, [loadArtworks])

  useEffect(() => {
    const ownerId = userId || resolvedUserId
    if (!supabase || !ownerId) return undefined
    const channel = supabase
      .channel(`museum-artworks-${ownerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'artworks', filter: `user_id=eq.${ownerId}` },
        () => {
          loadArtworks()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [loadArtworks, resolvedUserId, userId])

  return useMemo(
    () => ({ artworks, loading, error, reload: loadArtworks }),
    [artworks, error, loadArtworks, loading],
  )
}
