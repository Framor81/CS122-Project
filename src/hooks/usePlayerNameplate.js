import { useMemo } from 'react'

const CAPSULE_TOP_OFFSET_Y = 1.02

/**
 * Layout + display string for a floating name label above a player capsule.
 * Capsule uses radius 0.4 and length 1.0 — top ~0.9m above group origin.
 */
export function usePlayerNameplate(displayName, options = {}) {
  const maxLen = options.maxLen ?? 20

  return useMemo(() => {
    const raw = typeof displayName === 'string' ? displayName.trim() : ''
    const truncated =
      raw.length > maxLen ? `${raw.slice(0, maxLen - 1)}…` : raw || '…'

    return {
      billboardPosition: [0, CAPSULE_TOP_OFFSET_Y, 0],
      fontSize: 0.3,
      outlineWidth: 0.045,
      outlineColor: '#fff8f5',
      color: '#6b3d38',
      displayText: truncated,
    }
  }, [displayName, maxLen])
}
