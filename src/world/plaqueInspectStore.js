import { useSyncExternalStore } from 'react'

function shallowFocus(a, b) {
  if (a === b) return true
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.canOpen === b.canOpen &&
    Boolean(a.canToggleCaption) === Boolean(b.canToggleCaption)
  )
}

/** @type {{ focus: null | { id: string, canOpen: boolean, canToggleCaption?: boolean }, panel: null | { title: string, artist: string, description: string }, plaqueBodyModeById: Record<string, 'description' | 'caption'> }} */
let state = {
  focus: null,
  panel: null,
  plaqueBodyModeById: {},
}

const listeners = new Set()

function emit() {
  listeners.forEach((l) => l())
}

export function subscribePlaqueInspect(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPlaqueInspectFocus() {
  return state.focus
}

export function getPlaqueInspectPanel() {
  return state.panel
}

export function setPlaqueInspectFocus(next) {
  if (shallowFocus(state.focus, next)) return
  state = { ...state, focus: next }
  emit()
}

export function openPlaqueInspectPanel(payload) {
  state = { ...state, panel: payload }
  emit()
}

export function closePlaqueInspectPanel() {
  if (!state.panel) return
  state = { ...state, panel: null }
  emit()
}

export function getPlaqueBodyModes() {
  return state.plaqueBodyModeById
}

export function togglePlaqueBodyMode(id) {
  if (!id) return
  const prev = state.plaqueBodyModeById[id] || 'description'
  const next = prev === 'caption' ? 'description' : 'caption'
  state = {
    ...state,
    plaqueBodyModeById: {
      ...state.plaqueBodyModeById,
      [id]: next,
    },
  }
  emit()
}

export function usePlaqueInspectFocus() {
  return useSyncExternalStore(subscribePlaqueInspect, getPlaqueInspectFocus)
}

export function usePlaqueInspectPanel() {
  return useSyncExternalStore(subscribePlaqueInspect, getPlaqueInspectPanel)
}

export function usePlaqueBodyModes() {
  return useSyncExternalStore(subscribePlaqueInspect, getPlaqueBodyModes)
}
