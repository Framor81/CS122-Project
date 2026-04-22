import { useEffect, useMemo, useState } from 'react'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { generateFramePlacements } from './generateFramePlacements.js'
import { debugReport } from '../lib/debugBus.js'

const FRAME_COLOR = '#3b2a22'
const PICTURE_FALLBACK_COLOR = '#e8dccd'
const PLAQUE_COLOR = '#9a9a9a'
const PLAQUE_TEXT_COLOR = '#1a1a1a'

function useImageAspects(urls) {
  const [aspects, setAspects] = useState({})

  useEffect(() => {
    if (!urls || urls.length === 0) return undefined
    let cancelled = false
    const pending = urls.filter((u) => u && aspects[u] == null)
    if (!pending.length) return undefined

    pending.forEach((url) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (cancelled) return
        const aspect = img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1
        setAspects((prev) => ({ ...prev, [url]: aspect }))
      }
      img.onerror = () => {
        if (cancelled) return
        debugReport(`Image failed to load: ${url.slice(0, 80)}…`, 'error')
        setAspects((prev) => ({ ...prev, [url]: 1 }))
      }
      img.src = url
    })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls?.join('|')])

  return aspects
}

function useArtworkTexture(url) {
  const [texture, setTexture] = useState(null)
  useEffect(() => {
    if (!url) {
      setTexture(null)
      return undefined
    }
    let cancelled = false
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      url,
      (next) => {
        if (cancelled) {
          next.dispose()
          return
        }
        next.colorSpace = THREE.SRGBColorSpace
        next.anisotropy = 8
        next.needsUpdate = true
        debugReport(
          `Texture loaded ${next.image?.naturalWidth || '?'}x${
            next.image?.naturalHeight || '?'
          }: ${url.slice(0, 60)}…`,
          'info',
        )
        setTexture(next)
      },
      undefined,
      (err) => {
        if (!cancelled) {
          debugReport(
            `Texture load failed (${err?.message || 'CORS / network'}): ${url.slice(0, 60)}…`,
            'error',
          )
          setTexture(null)
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [url])

  useEffect(
    () => () => {
      texture?.dispose()
    },
    [texture],
  )

  return texture
}

function FramePlaque({ placement }) {
  const { frame, plaque, artwork } = placement
  const texture = useArtworkTexture(artwork?.imageUrl || '')

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
      {/* Picture (texture if loaded, else placeholder) */}
      <mesh
        position={[
          frame.position[0] + sinY * facePush,
          frame.position[1],
          frame.position[2] + cosY * facePush,
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

  return (
    <group>
      {placements.map((p) => (
        <FramePlaque key={p.id} placement={p} />
      ))}
    </group>
  )
}
