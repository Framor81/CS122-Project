import { useRef } from 'react'
import { PlaqueTargetsContext } from './plaqueTargetsContext.js'

export function PlaqueTargetsProvider({ children }) {
  const targetsRef = useRef(new Map())
  return (
    <PlaqueTargetsContext.Provider value={targetsRef}>
      {children}
    </PlaqueTargetsContext.Provider>
  )
}
