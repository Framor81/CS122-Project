import { useEffect, useRef } from 'react'

const LOOK_SENSITIVITY = 0.002

export function useGameInput({ disabled = false } = {}) {
  const stateRef = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    sprint: false,
    crouch: false,
    dive: false,
    yaw: 0,
    pitch: 0,
    jumpQueued: false,
  })
  const disabledRef = useRef(Boolean(disabled))

  useEffect(() => {
    disabledRef.current = Boolean(disabled)
    if (!disabledRef.current) return
    const s = stateRef.current
    s.forward = false
    s.backward = false
    s.left = false
    s.right = false
    s.sprint = false
    s.crouch = false
    s.dive = false
    s.jumpQueued = false
  }, [disabled])

  useEffect(() => {
    const s = stateRef.current

    const keyDown = (event) => {
      if (disabledRef.current) return
      if (event.code === 'KeyW') s.forward = true
      if (event.code === 'KeyS') s.backward = true
      if (event.code === 'KeyA') s.left = true
      if (event.code === 'KeyD') s.right = true
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') s.sprint = true
      if (event.code === 'KeyC') s.crouch = true
      // Dive (combat-only): press F.
      if (event.code === 'KeyF') s.dive = true
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        s.jumpQueued = true
      }
    }

    const keyUp = (event) => {
      if (disabledRef.current) return
      if (event.code === 'KeyW') s.forward = false
      if (event.code === 'KeyS') s.backward = false
      if (event.code === 'KeyA') s.left = false
      if (event.code === 'KeyD') s.right = false
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') s.sprint = false
      if (event.code === 'KeyC') s.crouch = false
      if (event.code === 'KeyF') s.dive = false
    }

    const mouseMove = (event) => {
      if (disabledRef.current) return
      if (!document.pointerLockElement) return
      s.yaw -= event.movementX * LOOK_SENSITIVITY
      s.pitch += event.movementY * LOOK_SENSITIVITY
      s.pitch = Math.max(-1.2, Math.min(1.2, s.pitch))
    }

    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)
    window.addEventListener('mousemove', mouseMove)

    return () => {
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('mousemove', mouseMove)
    }
  }, [])

  return stateRef
}
