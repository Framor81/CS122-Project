import { useEffect, useState } from 'react'
import { useTexture } from '@react-three/drei'
import { loadImage } from '../world/loadArtworkImage.js'
import { debugReport } from '../lib/debugBus.js'

/**
 * Eagerly preload every artwork image (using the same cache the 3D layer
 * uses) and report ready/progress state. We use this to gate museum entry
 * with a loading screen so the user never sees blank/loading frames pop in.
 *
 * Returns:
 *   {
 *     ready:   boolean   // true when ALL urls have settled (success or fail)
 *     loaded:  number    // urls that loaded successfully
 *     errored: number    // urls that failed (after retries)
 *     total:   number    // total urls being tracked
 *   }
 *
 * Implementation notes:
 * - Loading happens through the shared `loadImage` module cache, so the same
 *   work is not duplicated when FramesLayer also asks for these urls.
 * - `loadImage` already retries with backoff (CORS / transient failures),
 *   then rejects. We treat that final rejection as a hard error so the
 *   loading screen can dismiss instead of stalling forever.
 * - Falls back to a 12 second hard timeout per url so we never block the
 *   museum entry indefinitely if something goes sideways with the network.
 */
const HARD_TIMEOUT_MS = 12000

export function useArtworksReady(urls, { enabled = true } = {}) {
  const [state, setState] = useState({
    ready: false,
    loaded: 0,
    errored: 0,
    total: 0,
  })

  // Track on each url whether it has settled in this effect run, so the
  // counters always match what we attached to.
  const key = (urls || []).join('|')

  useEffect(() => {
    if (!enabled) return undefined
    const list = (urls || []).filter(Boolean)
    if (list.length === 0) {
      setState({ ready: true, loaded: 0, errored: 0, total: 0 })
      return undefined
    }

    let cancelled = false
    let loaded = 0
    let errored = 0
    setState({ ready: false, loaded: 0, errored: 0, total: list.length })

    // Warm drei's internal texture cache so when the FramePlaque components
    // mount and call useTexture(url), the texture is already resolved.
    try {
      useTexture.preload(list)
    } catch {
      // drei preload is best-effort.
    }

    const settle = (kind) => {
      if (cancelled) return
      if (kind === 'loaded') loaded += 1
      else errored += 1
      const done = loaded + errored
      const isReady = done >= list.length
      setState({
        ready: isReady,
        loaded,
        errored,
        total: list.length,
      })
      if (isReady) {
        debugReport(
          `Museum preload finished: ${loaded}/${list.length} loaded, ${errored} errored.`,
          errored > 0 ? 'warn' : 'info',
        )
      }
    }

    const timers = list.map((url) => {
      const id = window.setTimeout(() => {
        debugReport(
          `Image preload timed out after ${HARD_TIMEOUT_MS}ms: ${url.slice(0, 60)}…`,
          'warn',
        )
        settle('errored', url)
      }, HARD_TIMEOUT_MS)
      loadImage(url)
        .then(() => {
          window.clearTimeout(id)
          settle('loaded', url)
        })
        .catch((err) => {
          window.clearTimeout(id)
          debugReport(
            `Image preload failed (${err?.message || 'CORS / network'}): ${url.slice(0, 60)}…`,
            'error',
          )
          settle('errored', url)
        })
      return id
    })

    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
    // We want this to re-run whenever the set of urls (by content) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])

  return state
}
