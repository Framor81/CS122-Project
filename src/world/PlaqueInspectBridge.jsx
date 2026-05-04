import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  closePlaqueInspectPanel,
  openPlaqueInspectPanel,
  setPlaqueInspectFocus,
} from './plaqueInspectStore.js'
import { usePlaqueTargetsRef } from './usePlaqueTargetsRef.js'

const MAX_DIST = 1.55
const MIN_FACE_DOT = 0.78

/**
 * Tracks camera vs registered plaques; enables F to open full copy when not in combat.
 */
export function PlaqueInspectBridge({ chatOpen = false, combatEnabled = false }) {
  const { camera } = useThree()
  const targetsRef = usePlaqueTargetsRef()
  const focusPayloadRef = useRef(null)
  const lastFocusKeyRef = useRef('')

  useFrame(() => {
    if (combatEnabled || chatOpen) {
      focusPayloadRef.current = null
      if (lastFocusKeyRef.current !== '') {
        lastFocusKeyRef.current = ''
        setPlaqueInspectFocus(null)
      }
      return
    }

    const map = targetsRef?.current
    if (!map || map.size === 0) {
      focusPayloadRef.current = null
      if (lastFocusKeyRef.current !== '') {
        lastFocusKeyRef.current = ''
        setPlaqueInspectFocus(null)
      }
      return
    }

    const camPos = camera.position
    const camDir = new THREE.Vector3()
    camera.getWorldDirection(camDir)

    let best = null
    let bestDist = Infinity

    for (const t of map.values()) {
      const dx = t.position[0] - camPos.x
      const dy = t.position[1] - camPos.y
      const dz = t.position[2] - camPos.z
      const distSq = dx * dx + dy * dy + dz * dz
      if (distSq > MAX_DIST * MAX_DIST) continue

      const toPlaque = new THREE.Vector3(dx, dy, dz)
      const dist = Math.sqrt(distSq)
      if (dist < 1e-4) continue
      toPlaque.multiplyScalar(1 / dist)

      const facing = camDir.dot(toPlaque)
      if (facing < MIN_FACE_DOT) continue

      if (Math.abs(dy) > 2.15) continue

      if (dist < bestDist) {
        bestDist = dist
        best = t
      }
    }

    focusPayloadRef.current = best

    const canOpen = Boolean(
      best &&
        ((best.description && best.description.trim()) ||
          (best.title && best.title.trim() && best.title !== 'Untitled')),
    )
    const key = best ? `${best.id}|${canOpen ? 1 : 0}` : ''

    if (key !== lastFocusKeyRef.current) {
      lastFocusKeyRef.current = key
      if (!best) {
        setPlaqueInspectFocus(null)
      } else {
        setPlaqueInspectFocus({
          id: best.id,
          canOpen,
        })
      }
    }
  })

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'KeyF' || event.repeat) return
      if (chatOpen || combatEnabled) return
      const t = focusPayloadRef.current
      if (!t) return
      const desc = (t.description || '').trim()
      const title = (t.title || '').trim()
      if (!desc && (!title || title === 'Untitled')) return
      event.preventDefault()
      openPlaqueInspectPanel({
        title: t.title || 'Untitled',
        artist: t.artist || '',
        description: desc,
      })
    }

    const onKeyUp = (event) => {
      if (event.code !== 'Escape') return
      closePlaqueInspectPanel()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [chatOpen, combatEnabled])

  return null
}
