import { useEffect, useMemo, useState } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { generateFramePlacements } from './generateFramePlacements.js'
import { debugReport } from '../lib/debugBus.js'

const FRAME_COLOR = '#3b2a22'
const PICTURE_FALLBACK_COLOR = '#e8dccd'
const PLAQUE_COLOR = '#9a9a9a'
const PLAQUE_TEXT_COLOR = '#1a1a1a'

// Single shared image-element cache: one fetch per URL ever, with a single
// CORS-marked HTMLImageElement reused for both aspect detection AND texture
// creation. This prevents the "tainted texture" / white-painting race that
// happened when multiple parallel fetches for the same URL ended up cached
// inconsistently between CORS and non-CORS responses.
const imageCache = new Map() // url -> { promise: Promise<HTMLImageElement>, img: HTMLImageElement }
const textureCache = new Map() // url -> THREE.Texture (built from cached image)

function loadImage(url, attempt = 0) {
  const existing = imageCache.get(url)
  if (existing) return existing.promise
  const img = new Image()
  img.crossOrigin = 'anonymous'
  const promise = new Promise((resolve, reject) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      resolve(img)
    }
    const fail = (err) => {
      if (settled) return
      settled = true
      reject(err)
    }
    img.onload = () => {
      // Wait for full decode so WebGL uploads receive valid pixel data.
      // Without this, three.js can upload a not-yet-decoded image, leaving
      // the GPU texture as the default 1x1 white forever (until needsUpdate
      // is set again). Decode rejection isn't fatal — onload guarantees the
      // raw bytes are loaded, so we still resolve with the image either way.
      if (typeof img.decode === 'function') {
        img.decode().then(finish, finish)
      } else {
        finish()
      }
    }
    img.onerror = (err) => fail(err)
  })
  imageCache.set(url, { promise, img })
  img.src = url
  promise.catch(() => {
    imageCache.delete(url)
    if (attempt < 2) {
      const delayMs = 220 * (attempt + 1)
      debugReport(
        `Image load retry ${attempt + 1}/2 in ${delayMs}ms: ${url.slice(0, 60)}…`,
        'warn',
      )
      window.setTimeout(() => {
        loadImage(url, attempt + 1).catch(() => {})
      }, delayMs)
    }
  })
  return promise
}

function buildTextureFromImage(img) {
  const tex = new THREE.Texture(img)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

function useImageAspects(urls, reloadToken = 0) {
  const [aspects, setAspects] = useState({})

  useEffect(() => {
    if (!urls || urls.length === 0) return undefined
    let cancelled = false
    const pending = urls.filter((u) => u && aspects[u] == null)
    if (!pending.length) return undefined

    pending.forEach((url) => {
      loadImage(url)
        .then((img) => {
          if (cancelled) return
          const aspect =
            img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1
          setAspects((prev) => ({ ...prev, [url]: aspect }))
        })
        .catch(() => {
          if (cancelled) return
          debugReport(`Image failed to load: ${url.slice(0, 80)}…`, 'error')
          setAspects((prev) => ({ ...prev, [url]: 1 }))
        })
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls?.join('|'), reloadToken])

  return aspects
}

function useArtworkTexture(url, reloadToken = 0) {
  const [texture, setTexture] = useState(null)
  useEffect(() => {
    if (!url) {
      setTexture(null)
      return undefined
    }
    let cancelled = false

    // Always force a fresh GPU upload when this hook attaches a texture to a
    // material. Without this, a re-mount that hits the texture cache may end
    // up using a `THREE.Texture` whose previous GPU upload happened before the
    // image finished decoding — leaving a 1x1 white texture on the GPU even
    // though `texture.image` is fully decoded in JS.
    const useTex = (tex) => {
      tex.needsUpdate = true
      // Belt-and-suspenders: re-mark on the next animation frame too, so any
      // race between React commit and the renderer's first draw is covered.
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          if (!cancelled) tex.needsUpdate = true
        })
      }
      setTexture(tex)
    }

    const existing = textureCache.get(url)
    if (
      existing &&
      existing.image &&
      existing.image.complete &&
      existing.image.naturalWidth > 0
    ) {
      useTex(existing)
      return () => {
        cancelled = true
      }
    }

    loadImage(url)
      .then((img) => {
        if (cancelled) return
        let tex = textureCache.get(url)
        if (!tex) {
          tex = buildTextureFromImage(img)
          textureCache.set(url, tex)
        } else if (tex.image !== img) {
          // Refresh the image reference if a prior cached entry was built
          // before the image finished decoding.
          tex.image = img
        }
        debugReport(
          `Texture ready ${img.naturalWidth}x${img.naturalHeight}: ${url.slice(0, 60)}…`,
          'info',
        )
        useTex(tex)
      })
      .catch((err) => {
        if (cancelled) return
        debugReport(
          `Texture load failed (${err?.message || 'CORS / network'}): ${url.slice(0, 60)}…`,
          'error',
        )
        setTexture(null)
      })

    return () => {
      cancelled = true
    }
  }, [url, reloadToken])

  return texture
}

function FramePlaque({ placement, reloadToken }) {
  const { frame, plaque, artwork } = placement
  const texture = useArtworkTexture(artwork?.imageUrl || '', reloadToken)

  // Inner picture area: snug aspect-fit inside the frame's interior.
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
  // Nudge far enough off the frame face to eliminate z-fighting (which can
  // render as black pixels where depth buffers flicker).
  const facePush = frame.depth / 2 + 0.012
  const plaqueFacePush = plaque.depth / 2 + 0.001

  return (
    <group>
      {/* Frame border */}
      <mesh position={frame.position} rotation={frame.rotation} castShadow>
        <boxGeometry args={[frame.width, frame.height, frame.depth]} />
        <meshStandardMaterial color={FRAME_COLOR} roughness={0.7} />
      </mesh>
      {/* Picture on both faces. This guards against wrong wall-normal direction:
          even if a frame is oriented to the opposite side, one face stays visible. */}
      {[1, -1].map((sign) => (
        <mesh
          key={`picture-face-${sign}`}
          position={[
            frame.position[0] + sinY * facePush * sign,
            frame.position[1],
            frame.position[2] + cosY * facePush * sign,
          ]}
          rotation={frame.rotation}
        >
          <planeGeometry args={[Math.max(0.01, picW), Math.max(0.01, picH)]} />
          {texture ? (
            <meshStandardMaterial
              map={texture}
              emissiveMap={texture}
              emissive={'#ffffff'}
              emissiveIntensity={0.35}
              roughness={0.85}
              toneMapped={true}
              side={THREE.DoubleSide}
            />
          ) : (
            <meshStandardMaterial
              color={PICTURE_FALLBACK_COLOR}
              roughness={0.95}
              side={THREE.DoubleSide}
            />
          )}
        </mesh>
      ))}

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
    </group>
  )
}

export function FramesLayer({
  walls,
  wallHeight,
  floorThickness,
  wallThickness,
  artworks = null,
  reloadToken = 0,
}) {
  const urls = useMemo(
    () => (artworks ? artworks.map((a) => a?.imageUrl).filter(Boolean) : []),
    [artworks],
  )
  // When reloadToken changes, clear cached entries for current URLs so the
  // next render rebuilds them cleanly. We keep the cache otherwise so
  // regenerations and re-mounts reuse already-loaded textures.
  useEffect(() => {
    if (reloadToken <= 0) return
    urls.forEach((url) => {
      imageCache.delete(url)
      const tex = textureCache.get(url)
      if (tex) {
        // Detach texture from any GPU resource; it'll be rebuilt next load.
        tex.dispose?.()
        textureCache.delete(url)
      }
    })
  }, [reloadToken, urls])

  const aspects = useImageAspects(urls, reloadToken)

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

  return (
    <group>
      {placements.map((p) => (
        <FramePlaque key={p.id} placement={p} reloadToken={reloadToken} />
      ))}
    </group>
  )
}
