import { useLayoutEffect, useMemo, useRef } from 'react'
import { CELL_FLOOR } from './grid/Grid.js'

/** Very sparse ceiling spots — each extra SpotLight hits every mesh in the forward pass. */
const MAX_FIXTURES = 16
/** ~9 m between fixtures (18 × 0.5 m cells). */
const STEP_CELLS = 18

/** Hang below underside so trim reads against slate ceiling (meters). */
const HANG_BELOW_CEILING = 0.18

const FIXTURE_RADIUS = 0.4

/**
 * Corridor spine from carved segments — axis-aligned center column / row only (hall center).
 * Skips exterior approach (south strip): indoor starts at entrance door row.
 */
function hallwayFixtureWorldPositions(grid, meta, wallParams) {
  if (!grid || !meta?.segments?.length) return []

  const floorThickness = wallParams?.floorThickness ?? 0.12
  const wallHeight = wallParams?.wallHeight ?? 7.8
  const undersideY = floorThickness + wallHeight
  const mountY = undersideY - HANG_BELOW_CEILING

  const minIndoorZ = meta.entrance?.cell?.z ?? 0
  const out = []
  const seen = new Set()

  const pushCell = (cx, cz) => {
    if (!grid.inBounds(cx, cz) || grid.get(cx, cz) !== CELL_FLOOR) return
    if (cz < minIndoorZ) return
    const key = `${cx},${cz}`
    if (seen.has(key)) return
    seen.add(key)
    const [wx, wz] = grid.cellToWorld(cx, cz)
    out.push([wx, mountY, wz])
  }

  for (const seg of meta.segments) {
    const { x0, z0, x1, z1 } = seg
    if (x0 === x1) {
      const zLo = Math.min(z0, z1)
      const zHi = Math.max(z0, z1)
      for (let z = zLo; z <= zHi; z += STEP_CELLS) {
        pushCell(x0, z)
        if (out.length >= MAX_FIXTURES) return out
      }
    } else {
      const xLo = Math.min(x0, x1)
      const xHi = Math.max(x0, x1)
      for (let x = xLo; x <= xHi; x += STEP_CELLS) {
        if (z0 < minIndoorZ) continue
        pushCell(x, z0)
        if (out.length >= MAX_FIXTURES) return out
      }
    }
  }

  return out
}

function CeilingFixture({ x, y, z }) {
  const lightRef = useRef(null)
  const targetRef = useRef(null)

  useLayoutEffect(() => {
    const L = lightRef.current
    const T = targetRef.current
    if (L && T) {
      L.target = T
      T.updateMatrixWorld(true)
    }
  }, [x, y, z])

  return (
    <group position={[x, y, z]}>
      {/* Short stem so fixture reads as attached to ceiling */}
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[FIXTURE_RADIUS * 0.22, FIXTURE_RADIUS * 0.28, 0.1, 12]} />
        <meshStandardMaterial
          color="#4a4035"
          roughness={0.55}
          metalness={0.35}
          emissive="#2a2218"
          emissiveIntensity={0.08}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[FIXTURE_RADIUS, 20]} />
        <meshStandardMaterial
          color="#f5e6c8"
          roughness={0.38}
          metalness={0.45}
          emissive="#ffd699"
          emissiveIntensity={0.42}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, 0]}>
        <ringGeometry args={[FIXTURE_RADIUS * 0.42, FIXTURE_RADIUS * 0.96, 20]} />
        <meshStandardMaterial
          color="#6b5c48"
          roughness={0.65}
          metalness={0.3}
          emissive="#3d3428"
          emissiveIntensity={0.12}
        />
      </mesh>

      <group ref={targetRef} position={[0, -11, 0]} />
      <spotLight
        ref={lightRef}
        position={[0, -0.05, 0]}
        angle={0.44}
        intensity={22}
        penumbra={0.35}
        color="#ffc95c"
        distance={72}
        decay={2}
        castShadow={false}
      />
    </group>
  )
}

/**
 * Hallway-centered recessed trims + warm spots — indoor segments only (no exterior strip).
 */
export function CeilingLightsLayer({ grid, meta, wallParams }) {
  const fixtures = useMemo(
    () => hallwayFixtureWorldPositions(grid, meta, wallParams),
    [grid, meta, wallParams],
  )

  return (
    <group>
      {fixtures.map((pos, i) => (
        <CeilingFixture key={`ceil-fix-${pos[0]}-${pos[2]}-${i}`} x={pos[0]} y={pos[1]} z={pos[2]} />
      ))}
    </group>
  )
}
