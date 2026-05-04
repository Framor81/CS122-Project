import { useEffect, useMemo, useState } from 'react'
import { generateFramePlacements } from './generateFramePlacements.js'
import { debugReport } from '../lib/debugBus.js'
import { Painting } from './GalleryPainting.jsx'

const aspectCache = new Map() // url -> aspect number (or Promise while pending)

function loadAspect(url) {
  const cached = aspectCache.get(url)
  if (typeof cached === 'number') return Promise.resolve(cached)
  if (cached) return cached
  const promise = new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const aspect =
        img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1
      aspectCache.set(url, aspect)
      resolve(aspect)
    }
    img.onerror = () => {
      aspectCache.set(url, 1)
      resolve(1)
    }
    img.src = url
  })
  aspectCache.set(url, promise)
  return promise
}

function useImageAspects(urls) {
  const [aspects, setAspects] = useState({})
  useEffect(() => {
    if (!urls || urls.length === 0) return undefined
    let cancelled = false
    urls.forEach((url) => {
      if (!url) return
      loadAspect(url).then((aspect) => {
        if (cancelled) return
        setAspects((prev) =>
          prev[url] === aspect ? prev : { ...prev, [url]: aspect },
        )
      })
    })
    return () => {
      cancelled = true
    }
  }, [urls])
  return aspects
}

export function FramesLayer({
  walls,
  wallHeight,
  floorThickness,
  wallThickness,
  artworks = null,
}) {
  const urls = useMemo(
    () => (artworks ? artworks.map((a) => a?.imageUrl).filter(Boolean) : []),
    [artworks],
  )

  const aspects = useImageAspects(urls)

  const enrichedArtworks = useMemo(() => {
    if (!artworks) return null
    return artworks
      .filter((a) => a && a.imageUrl)
      .map((a) => ({ ...a, aspect: aspects[a.imageUrl] || null }))
  }, [artworks, aspects])

  const placements = useMemo(
    () =>
      generateFramePlacements(walls, {
        wallHeight,
        floorThickness,
        wallThickness,
        artworks: enrichedArtworks,
      }),
    [walls, wallHeight, floorThickness, wallThickness, enrichedArtworks],
  )

  useEffect(() => {
    if (!artworks) return
    debugReport(
      `FramesLayer: ${artworks.length} artwork(s), ${placements.length} placement(s).`,
      'info',
    )
  }, [artworks, placements.length])

  return (
    <group>
      {placements.map((p) => (
        <Painting key={p.id} placement={p} />
      ))}
    </group>
  )
}
