import { useMemo } from 'react'

const DEFAULT_TRIGRAM = 'xxx'

function hslToRgb(h, s, l) {
  // h: 0..360, s/l: 0..1
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r1 = 0
  let g1 = 0
  let b1 = 0

  if (hp >= 0 && hp < 1) {
    r1 = c
    g1 = x
    b1 = 0
  } else if (hp >= 1 && hp < 2) {
    r1 = x
    g1 = c
    b1 = 0
  } else if (hp >= 2 && hp < 3) {
    r1 = 0
    g1 = c
    b1 = x
  } else if (hp >= 3 && hp < 4) {
    r1 = 0
    g1 = x
    b1 = c
  } else if (hp >= 4 && hp < 5) {
    r1 = x
    g1 = 0
    b1 = c
  } else {
    r1 = c
    g1 = 0
    b1 = x
  }

  const m = l - c / 2
  const r = Math.round((r1 + m) * 255)
  const g = Math.round((g1 + m) * 255)
  const b = Math.round((b1 + m) * 255)
  return { r, g, b }
}

function normalizeName(name) {
  const cleaned = (name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  return cleaned.length ? cleaned : DEFAULT_TRIGRAM
}

// FNV-1a 32-bit hash so the same full name => same deterministic color.
function hash32(str) {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Deterministic pastel-ish RGB (w/ more variety) based on the whole name. */
export function capsuleColorFromName(name) {
  const cleaned = normalizeName(name)
  const h = hash32(cleaned)

  const hue = h % 360
  const sat = 0.42 + ((h >>> 8) % 100) / 100 * 0.38 // ~0.42..0.80
  const light = 0.60 + ((h >>> 16) % 100) / 100 * 0.18 // ~0.60..0.78

  const rgb = hslToRgb(hue, sat, light)
  return `rgb(${rgb.r},${rgb.g},${rgb.b})`
}

export function useCapsuleColorFromName(name) {
  return useMemo(() => capsuleColorFromName(name), [name])
}
