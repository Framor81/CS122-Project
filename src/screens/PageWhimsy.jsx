import { useEffect, useMemo, useRef } from 'react'

function hash01(i, salt = 0) {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453
  return x - Math.floor(x)
}

export function PageWhimsy() {
  const ref = useRef(null)
  const shapes = useMemo(() => {
    const types = ['circle', 'triangle', 'square', 'diamond']
    return Array.from({ length: 50 }, (_, i) => {
      const type = types[Math.floor(hash01(i, 1) * types.length)]
      const size = 18 + hash01(i, 2) * 90
      const left = hash01(i, 3) * 96
      const top = hash01(i, 4) * 92
      const driftX = (hash01(i, 5) * 2 - 1) * 20
      const driftY = (hash01(i, 6) * 2 - 1) * 14
      const delay = hash01(i, 7) * 2.6
      const duration = 4 + hash01(i, 8) * 5.2
      const colors = ['#fff2b8', '#cbe9ff', '#ffd9f1', '#d8f4c1', '#ffe3bf']
      const color = colors[Math.floor(hash01(i, 9) * colors.length)]
      return {
        id: `w-${i}`,
        type,
        size,
        left,
        top,
        driftX,
        driftY,
        delay,
        duration,
        color,
      }
    })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined

    const onMove = (event) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = (event.clientY / window.innerHeight) * 2 - 1
      el.style.setProperty('--mx', x.toFixed(3))
      el.style.setProperty('--my', y.toFixed(3))
    }

    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div ref={ref} className="museum-gate__whimsy" aria-hidden="true">
      {shapes.map((s) => (
        (() => {
          const baseTransform = `translate(calc(var(--mx) * ${s.driftX}px), calc(var(--my) * ${s.driftY}px))`
          const transform =
            s.type === 'diamond'
              ? `${baseTransform} rotate(45deg)`
              : baseTransform
          return (
        <span
          key={s.id}
          className={`museum-gate__whimsy-shape museum-gate__whimsy-shape--${s.type}`}
          style={{
            width: `${s.size}px`,
            height: `${s.size}px`,
            left: `${s.left}%`,
            top: `${s.top}%`,
            background: s.color,
            '--tri-size': `${s.size}px`,
            '--tri-color': s.color,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            transform,
          }}
        />
          )
        })()
      ))}
    </div>
  )
}

