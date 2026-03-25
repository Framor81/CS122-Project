import { useEffect, useState } from 'react'

export function useCombatMode() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'KeyX') setEnabled(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return enabled
}
