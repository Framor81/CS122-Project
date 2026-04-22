/**
 * Lightweight global debug bus. Any module can `debugReport(...)` and any UI
 * (e.g. the session chat) can `subscribeDebug(cb)` to render the messages.
 *
 * Debug events are *not* sent to Supabase — they're local-only diagnostics.
 */

let enabled = false
const listeners = new Set()
const recent = []
const MAX_BUFFER = 200

function getDebugFromUrl() {
  if (typeof window === 'undefined') return false
  const qs = new URLSearchParams(window.location.search)
  if (qs.has('debug')) return qs.get('debug') !== '0'
  if (qs.has('debugMuseum')) return true
  if (qs.has('debugChat')) return true
  return false
}

export function setDebugEnabled(value) {
  enabled = Boolean(value)
}

export function isDebugEnabled() {
  return enabled || getDebugFromUrl()
}

export function debugReport(text, kind = 'info') {
  if (!isDebugEnabled()) return
  const message = String(text || '').trim()
  if (!message) return
  const event = {
    id: `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    text: message,
    kind,
    at: Date.now(),
  }
  recent.push(event)
  if (recent.length > MAX_BUFFER) recent.shift()
  for (const cb of listeners) {
    try {
      cb(event)
    } catch {
      /* ignore listener errors */
    }
  }
}

export function subscribeDebug(cb) {
  if (typeof cb !== 'function') return () => {}
  listeners.add(cb)
  // Replay recent buffer on subscribe so late mounts still see prior events.
  for (const event of recent) {
    try {
      cb(event)
    } catch {
      /* ignore */
    }
  }
  return () => listeners.delete(cb)
}
