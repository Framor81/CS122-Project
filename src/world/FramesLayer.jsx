import { Suspense, useEffect, useMemo, useState } from 'react'
import { Text, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { generateFramePlacements } from './generateFramePlacements.js'
import { debugReport } from '../lib/debugBus.js'

// Visible per-frame debug indicators. Toggle via `?debug=1`, `?debugMuseum=1`,
// or `?debugTextures=1` in the URL.
const DEBUG_TEXTURES = (() => {
  if (typeof window === 'undefined') return false
  const q = window.location.search
  return /[?&](debug|debugMuseum|debugTextures)=1\b/.test(q)
})()

const FRAME_COLOR = '#3b2a22'
const PICTURE_FALLBACK_COLOR = '#e8dccd'
const PLAQUE_COLOR = '#9a9a9a'
const PLAQUE_TEXT_COLOR = '#1a1a1a'

/**
 * Preload an image to measure its aspect ratio (width / height). Needed by
 * `generateFramePlacements` to size each frame to match the artwork BEFORE
 * the 3D mesh mounts. Uses a tiny module cache so the same url only loads
 * once across mounts / HMR.
 */
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

/**
 * The ONE picture plane inside the frame. Uses drei's `useTexture` which
 * suspends until the texture is fully loaded and GPU-uploaded, so there is
 * no race, no white flash, no black fallback — it simply doesn't render
 * until the painting is ready. Wrap it in <Suspense> in the parent.
 */
function PicturePlane({ url, picW, picH, position, rotation }) {
  const texture = useTexture(url)

  // drei's useTexture doesn't set sRGB encoding by default for all three
  // versions, so set it explicitly. This ensures colors render correctly
  // for standard JPG/PNG artwork images.
  useEffect(() => {
    if (!texture) return
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    texture.needsUpdate = true
  }, [texture])

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[Math.max(0.01, picW), Math.max(0.01, picH)]} />
      <meshBasicMaterial
        map={texture}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function PicturePlaceholder({ picW, picH, position, rotation }) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[Math.max(0.01, picW), Math.max(0.01, picH)]} />
      <meshBasicMaterial
        color={PICTURE_FALLBACK_COLOR}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

const DEBUG_BEAD_COLORS = {
  loading: '#ffd84a',
  ready: '#3acc6a',
  missing: '#bbbbbb',
}

function DebugBead({ position, status }) {
  const color = DEBUG_BEAD_COLORS[status] || '#ff00ff'
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <Text
        position={[0, 0.16, 0]}
        color={color}
        fontSize={0.09}
        outlineWidth={0.012}
        outlineColor="#000"
        anchorX="center"
        anchorY="middle"
      >
        {status}
      </Text>
    </group>
  )
}

function FramePlaque({ placement }) {
  const { frame, plaque, artwork } = placement
  const [isReady, setIsReady] = useState(false)

  // Inner picture area: aspect-fit inside the frame interior.
  const innerMaxW = Math.max(0, frame.width - frame.pictureInset * 2)
  const innerMaxH = Math.max(0, frame.height - frame.pictureInset * 2)
  const aspect = frame.aspect || (artwork?.aspect ?? null)
  let picW = innerMaxW
  let picH = innerMaxH
  if (aspect && aspect > 0) {
    const fitH = innerMaxW / aspect
    if (fitH <= innerMaxH) {
      picW = innerMaxW
      picH = fitH
    } else {
      picH = innerMaxH
      picW = innerMaxH * aspect
    }
  }

  const sinY = Math.sin(frame.rotation[1])
  const cosY = Math.cos(frame.rotation[1])
  // Push the picture plane slightly off the frame front face into the room.
  const facePush = frame.depth / 2 + 0.008
  const picturePosition = [
    frame.position[0] + sinY * facePush,
    frame.position[1],
    frame.position[2] + cosY * facePush,
  ]
  const plaqueFacePush = plaque.depth / 2 + 0.001

  const url = artwork?.imageUrl || ''
  const hasUrl = Boolean(url)
  const debugStatus = !hasUrl ? 'missing' : isReady ? 'ready' : 'loading'

  return (
    <group>
      {/* Frame border */}
      <mesh position={frame.position} rotation={frame.rotation} castShadow>
        <boxGeometry args={[frame.width, frame.height, frame.depth]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.7} />
      </mesh>

      {/* Picture: suspends on texture load, so we only mount it when the
          image is actually ready. No custom cache needed. */}
      {hasUrl ? (
        <Suspense
          fallback={
            <PicturePlaceholder
              picW={picW}
              picH={picH}
              position={picturePosition}
              rotation={frame.rotation}
            />
          }
        >
          <PictureReadyGate onReady={setIsReady} />
          <PicturePlane
            url={url}
            picW={picW}
            picH={picH}
            position={picturePosition}
            rotation={frame.rotation}
          />
        </Suspense>
      ) : (
        <PicturePlaceholder
          picW={picW}
          picH={picH}
          position={picturePosition}
          rotation={frame.rotation}
        />
      )}

      {/* Plaque */}
      <mesh position={plaque.position} rotation={plaque.rotation} castShadow>
        <boxGeometry args={[plaque.width, plaque.height, plaque.depth]} />
        <meshStandardMaterial color={PLAQUE_COLOR} roughness={0.6} metalness={0.15} />
      </mesh>
      {/* Plaque text */}
      <Text
        position={[
          plaque.position[0] + Math.sin(plaque.rotation[1]) * plaqueFacePush,
          plaque.position[1],
          plaque.position[2] + Math.cos(plaque.rotation[1]) * plaqueFacePush,
        ]}
        rotation={plaque.rotation}
        color={PLAQUE_TEXT_COLOR}
        fontSize={Math.max(0.045, plaque.height * 0.14)}
        lineHeight={1.15}
        anchorX="center"
        anchorY="middle"
        maxWidth={Math.max(0.1, plaque.width - 0.08)}
        textAlign="center"
      >
        {plaque.text}
      </Text>

      {DEBUG_TEXTURES ? (
        <DebugBead
          position={[
            frame.position[0] + sinY * (facePush + 0.01),
            frame.position[1] + frame.height / 2 + 0.18,
            frame.position[2] + cosY * (facePush + 0.01),
          ]}
          status={debugStatus}
        />
      ) : null}
    </group>
  )
}

// Runs once when the suspense boundary resolves (ie. the sibling PicturePlane
// has rendered), letting the parent toggle its `isReady` debug state.
function PictureReadyGate({ onReady }) {
  useEffect(() => {
    onReady(true)
    return () => onReady(false)
  }, [onReady])
  return null
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
        <FramePlaque key={p.id} placement={p} />
      ))}
    </group>
  )
}

// Kept for backward compatibility with `useArtworksReady`, which preloads
// images outside the 3D tree (for the museum loading screen). Wraps the
// native Image load with retry + graceful fallback.
const imagePromiseCache = new Map()

export function loadImage(url) {
  const existing = imagePromiseCache.get(url)
  if (existing) return existing
  const promise = (async () => {
    // Try CORS-enabled first (so drei's useTexture can reuse the browser's
    // cached response for WebGL). Fall back to no-CORS if that fails — the
    // loading screen only needs to know the image was fetched.
    for (const useCors of [true, false]) {
      try {
        return await new Promise((resolve, reject) => {
          const img = new Image()
          if (useCors) img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('image onerror'))
          img.src = url
        })
      } catch (err) {
        if (!useCors) throw err
      }
    }
    throw new Error('image load failed')
  })()
  promise.catch(() => imagePromiseCache.delete(url))
  imagePromiseCache.set(url, promise)
  return promise
}
