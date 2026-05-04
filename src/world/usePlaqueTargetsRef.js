import { useContext } from 'react'
import { PlaqueTargetsContext } from './plaqueTargetsContext.js'

export function usePlaqueTargetsRef() {
  return useContext(PlaqueTargetsContext)
}
