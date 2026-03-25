import { useEffect, useRef, useState } from 'react'

export function useAimCursor() {
  const [screenPos, setScreenPos] = useState({
    x: window.innerWidth * 0.5,
    y: window.innerHeight * 0.5,
  })
  const ndcRef = useRef({ x: 0, y: 0 })
  const screenRef = useRef(screenPos)

  useEffect(() => {
    const writeNdc = (x, y) => {
      ndcRef.current = {
        x: (x / window.innerWidth) * 2 - 1,
        y: -(y / window.innerHeight) * 2 + 1,
      }
    }

    const onMouseMove = (event) => {
      const x = event.clientX
      const y = event.clientY
      screenRef.current = { x, y }
      setScreenPos({ x, y })
      writeNdc(x, y)
    }

    const onResize = () => {
      writeNdc(screenRef.current.x, screenRef.current.y)
    }

    writeNdc(screenRef.current.x, screenRef.current.y)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return { screenPos, aimNdcRef: ndcRef }
}
