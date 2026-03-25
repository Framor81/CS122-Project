import { useCallback, useEffect, useState } from 'react'

const MAX_HEALTH = 100
const REGEN_PER_SECOND = 3.2

export function useCombatHudState() {
  const [health, setHealth] = useState(MAX_HEALTH)
  const [gunState, setGunState] = useState({
    ammoInMag: 12,
    reserveAmmo: 72,
    isReloading: false,
    reloadProgress: 0,
  })

  useEffect(() => {
    const id = window.setInterval(() => {
      setHealth((prev) => Math.min(MAX_HEALTH, prev + REGEN_PER_SECOND * 0.1))
    }, 100)
    return () => window.clearInterval(id)
  }, [])

  const onGunStateChange = useCallback((next) => {
    setGunState(next)
  }, [])

  const healthRatio = Math.max(0, Math.min(1, health / MAX_HEALTH))

  return {
    health,
    healthRatio,
    gunState,
    onGunStateChange,
  }
}
