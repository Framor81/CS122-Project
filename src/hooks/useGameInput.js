import { useEffect, useRef } from 'react'

const LOOK_SENSITIVITY = 0.002

export function useGameInput() {
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

  useEffect(() => {
    const s = stateRef.current

    const keyDown = (event) => {
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
      if (event.code === 'KeyW') s.forward = false
      if (event.code === 'KeyS') s.backward = false
      if (event.code === 'KeyA') s.left = false
      if (event.code === 'KeyD') s.right = false
      if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') s.sprint = false
      if (event.code === 'KeyC') s.crouch = false
      if (event.code === 'KeyF') s.dive = false
    }

    const mouseMove = (event) => {
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
