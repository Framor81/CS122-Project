import { useSyncExternalStore } from 'react'

function shallowFocus(a, b) {
  if (a === b) return true
  if (!a && !b) return true
  if (!a || !b) return false
  return a.id === b.id && a.canOpen === b.canOpen
}

/** @type {{ focus: null | { id: string, canOpen: boolean }, panel: null | { title: string, artist: string, description: string } }} */
let state = {
  focus: null,
  panel: null,
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

export function usePlaqueInspectFocus() {
  return useSyncExternalStore(subscribePlaqueInspect, getPlaqueInspectFocus)
}

export function usePlaqueInspectPanel() {
  return useSyncExternalStore(subscribePlaqueInspect, getPlaqueInspectPanel)
}
