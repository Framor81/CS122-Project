import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { usePlaqueTargetsRef } from './usePlaqueTargetsRef.js'
import { usePlaqueBodyModes } from './plaqueInspectStore.js'

const FRAME_COLOR = '#c9a035'
const PICTURE_FALLBACK_COLOR = '#252525'
const PLAQUE_TEXT_COLOR = '#f2ead8'
const PLAQUE_PANEL_COLOR = '#14110e'

const DEBUG_TEXTURES = (() => {
  if (typeof window === 'undefined') return false
  const q = window.location.search
  return /[?&](debug|debugMuseum|debugTextures)=1\b/.test(q)
})()

const DEBUG_BEAD_COLORS = {
  loading: '#ffd84a',
  ready: '#3acc6a',
  missing: '#bbbbbb',
}

function PicturePlane({ url, picW, picH, position, rotation }) {
  const texture = useTexture(url)

  useEffect(() => {
    if (!texture) return
    // Configure GPU texture after load (Three mutates texture objects in place).
    Object.assign(texture, {
      colorSpace: THREE.SRGBColorSpace,
      anisotropy: 2,
      needsUpdate: true,
    })
  }, [texture])

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[Math.max(0.01, picW), Math.max(0.01, picH)]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

function PicturePlaceholder({ picW, picH, position, rotation }) {
  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[Math.max(0.01, picW), Math.max(0.01, picH)]} />
      <meshBasicMaterial color={PICTURE_FALLBACK_COLOR} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  )
}

function PictureReadyGate({ onReady }) {
  useEffect(() => {
    onReady(true)
    return () => onReady(false)
  }, [onReady])
  return null
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

const PLAQUE_FS_MIN = 0.032
const PLAQUE_FS_CAP = 0.086

function plaqueTextMountKey(placementId, text) {
  const s = String(text)
  let h = 0
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return `${placementId}-${s.length}-${h}`
}

function resolvePlaqueCopy(plaque, artwork) {
  if (!artwork) {
    return { title: 'Untitled', artist: '', description: '', caption: '' }
  }
  const title = ((plaque.title || '').trim() || 'Untitled')
  const artist = (plaque.artist || '').trim()
  const description = (plaque.description || '').trim()
  const caption = (plaque.caption || '').trim()
  return { title, artist, description, caption }
}

function buildPlaqueText(copy, body, mode) {
  const title = copy.title || 'Untitled'
  const artist = (copy.artist || '').trim()
  const showUnknownArtist = mode !== 'caption'
  const lines = [title]
  if (artist) {
    lines.push(artist)
  } else if (showUnknownArtist) {
    lines.push('Artist unknown')
  }
  if (body) lines.push(body)
  return lines.join('\n')
}

function PlaqueMeshText({ position, rotation, plaque, children }) {
  const maxH = plaque.height * 0.88
  const maxW = Math.max(0.38, plaque.width * 0.92)
  const [fontSize, setFontSize] = useState(
    () => Math.min(PLAQUE_FS_CAP, plaque.height * 0.062),
  )
  const shrinkAttempts = useRef(0)

  const onSync = useCallback(
    (troika) => {
      troika.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(troika)
      if (box.isEmpty()) return
      const size = new THREE.Vector3()
      box.getSize(size)
      if (size.y > maxH && fontSize > PLAQUE_FS_MIN + 1e-4 && shrinkAttempts.current < 28) {
        shrinkAttempts.current += 1
        setFontSize((f) => Math.max(PLAQUE_FS_MIN, f * 0.9))
      }
    },
    [fontSize, maxH],
  )

  return (
    <Text
      position={position}
      rotation={rotation}
      color={PLAQUE_TEXT_COLOR}
      fontSize={fontSize}
      lineHeight={1.2}
      anchorX="center"
      anchorY="middle"
      maxWidth={maxW}
      textAlign="left"
      outlineWidth={0.022}
      outlineColor="#0a0806"
      renderOrder={1}
      onSync={onSync}
    >
      {children}
    </Text>
  )
}

/**
 * Single gallery unit: gold frame, artwork plane, plaque text.
 * (Per-painting spotLights were removed — they multiplied GPU cost with collection size.)
 */
export function Painting({ placement }) {
  const { frame, plaque, artwork } = placement
  const [isReady, setIsReady] = useState(false)
  const targetsRef = usePlaqueTargetsRef()
  const plaqueBodyModes = usePlaqueBodyModes()

  const copy = useMemo(
    () => resolvePlaqueCopy(plaque, artwork),
    [plaque, artwork],
  )
  const selectedBodyMode = plaqueBodyModes?.[placement.id] || 'description'
  const bodyText =
    selectedBodyMode === 'caption'
      ? copy.caption || copy.description
      : copy.description || copy.caption
  const displayText = buildPlaqueText(copy, bodyText, selectedBodyMode)

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
  const facePush = frame.depth / 2 + 0.012
  const picturePosition = [
    frame.position[0] + sinY * facePush,
    frame.position[1],
    frame.position[2] + cosY * facePush,
  ]
  const plaqueFacePush = plaque.depth / 2 + 0.028
  const plaquePanelPush = plaque.depth / 2 + 0.012

  const panelPos = [
    plaque.position[0] + Math.sin(plaque.rotation[1]) * plaquePanelPush,
    plaque.position[1],
    plaque.position[2] + Math.cos(plaque.rotation[1]) * plaquePanelPush,
  ]
  const textPos = useMemo(
    () => [
      plaque.position[0] + Math.sin(plaque.rotation[1]) * plaqueFacePush,
      plaque.position[1],
      plaque.position[2] + Math.cos(plaque.rotation[1]) * plaqueFacePush,
    ],
    [
      plaque.position,
      plaque.rotation,
      plaqueFacePush,
    ],
  )

  useEffect(() => {
    if (!targetsRef || !artwork) return undefined
    const map = targetsRef.current
    const id = placement.id
    const entry = {
      id,
      position: textPos,
      title: copy.title,
      artist: copy.artist,
      description: copy.description,
      caption: copy.caption,
    }
    map.set(id, entry)
    return () => {
      map.delete(id)
    }
  }, [
    targetsRef,
    placement.id,
    artwork,
    textPos,
    copy.title,
    copy.artist,
    copy.description,
  ])

  const url = artwork?.imageUrl || ''
  const hasUrl = Boolean(url)
  const debugStatus = !hasUrl ? 'missing' : isReady ? 'ready' : 'loading'

  return (
    <group>
      <mesh position={frame.position} rotation={frame.rotation}>
        <boxGeometry args={[frame.width, frame.height, frame.depth]} />
        <meshStandardMaterial
          color={FRAME_COLOR}
          roughness={0.42}
          metalness={0.52}
          emissive="#6b5420"
          emissiveIntensity={0.12}
        />
      </mesh>

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

      <mesh position={panelPos} rotation={plaque.rotation} renderOrder={-1}>
        <planeGeometry args={[Math.max(0.4, plaque.width * 1.12), Math.max(0.35, plaque.height * 1.18)]} />
        <meshBasicMaterial
          color={PLAQUE_PANEL_COLOR}
          transparent
          opacity={0.94}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <PlaqueMeshText
        key={plaqueTextMountKey(placement.id, displayText)}
        position={textPos}
        rotation={plaque.rotation}
        plaque={plaque}
      >
        {displayText}
      </PlaqueMeshText>

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
