import { Text } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { generateMuseumGrid } from './generateMuseumGrid.js'
import { meshFromGrid } from './meshFromGrid.js'
import { CeilingLightsLayer } from './CeilingLightsLayer.jsx'
import { FramesLayer } from './FramesLayer.jsx'
import { debugReport } from '../lib/debugBus.js'

/** Warm floor vs cooler slate walls so planes separate; walls bright enough for lighting/fog depth. */
const FLOOR_COLOR = '#3f3834'
/** Alternating slate tones — corners and hall length read instead of a flat black hole. */
const WALL_COLOR_A = '#434a56'
const WALL_COLOR_B = '#3b414c'
/** Slightly darker than walls so the volume reads as a box. */
const CEILING_COLOR = '#2f3238'

export function MuseumLayout({
  seed = 'museum-seed-alpha',
  grid,
  meta,
  artworks = [],
  debug = false,
}) {
  const wallParams = useMemo(
    () => ({
      floorThickness: 0.12,
      wallHeight: 7.8,
      wallThickness: 0.22,
      ceilingThickness: 0.1,
    }),
    [],
  )

  const { mesh, usedMeta, layoutGrid } = useMemo(() => {
    const generated = grid && meta ? { grid, meta } : generateMuseumGrid(seed)
    return {
      mesh: meshFromGrid(generated.grid, wallParams),
      usedMeta: generated.meta,
      layoutGrid: generated.grid,
    }
  }, [seed, grid, meta, wallParams])

  useEffect(() => {
    if (!Array.isArray(artworks)) return
    if (artworks.length === 0) {
      debugReport('Collection is empty — generating procedural empty frames.', 'warn')
    } else {
      debugReport(
        `Collection contains ${artworks.length} artwork(s). Distributing one frame per artwork onto the largest wall runs.`,
        'info',
      )
    }
  }, [artworks])

  return (
    <group>
      {mesh.floors.map((f, idx) => (
        <mesh key={`f-${idx}`} position={f.center} receiveShadow>
          <boxGeometry args={f.size} />
          <meshStandardMaterial
            color={FLOOR_COLOR}
            roughness={0.65}
            metalness={0}
            emissive="#1a1512"
            emissiveIntensity={0.09}
          />
        </mesh>
      ))}

      {mesh.walls.map((w, idx) => (
        <mesh key={`w-${idx}`} position={w.center} castShadow>
          <boxGeometry args={w.size} />
          <meshStandardMaterial
            color={idx % 2 === 0 ? WALL_COLOR_A : WALL_COLOR_B}
            roughness={0.9}
            metalness={0}
            emissive={idx % 2 === 0 ? '#2a3038' : '#252b34'}
            emissiveIntensity={0.055}
          />
        </mesh>
      ))}

      {mesh.ceilings.map((c, idx) => (
        <mesh key={`ceil-${idx}`} position={c.center} receiveShadow>
          <boxGeometry args={c.size} />
          <meshStandardMaterial
            color={CEILING_COLOR}
            roughness={0.9}
            metalness={0}
            emissive="#22252c"
            emissiveIntensity={0.04}
          />
        </mesh>
      ))}

      <CeilingLightsLayer grid={layoutGrid} meta={usedMeta} wallParams={wallParams} />

      {Array.isArray(artworks) ? (
        <FramesLayer
          walls={mesh.walls}
          wallHeight={wallParams.wallHeight}
          floorThickness={wallParams.floorThickness}
          wallThickness={wallParams.wallThickness}
          artworks={artworks}
        />
      ) : null}

      {debug ? (
        <>
          {usedMeta.segments.map((s, idx) => {
            const dx = s.x1 - s.x0
            const dz = s.z1 - s.z0
            const lenCells = Math.abs(dx) + Math.abs(dz)
            const centerCellX = (s.x0 + s.x1) / 2
            const centerCellZ = (s.z0 + s.z1) / 2
            const worldX =
              (centerCellX - usedMeta.gridWidth / 2 + 0.5) * usedMeta.cellSize
            const worldZ =
              (centerCellZ - usedMeta.gridHeight / 2 + 0.5) * usedMeta.cellSize
            const alongX = dx !== 0
            return (
              <mesh
                key={`dbg-seg-${idx}`}
                position={[worldX, 0.08, worldZ]}
                receiveShadow={false}
              >
                <boxGeometry
                  args={
                    alongX
                      ? [lenCells * usedMeta.cellSize, 0.02, 0.2]
                      : [0.2, 0.02, lenCells * usedMeta.cellSize]
                  }
                />
                <meshBasicMaterial color="#d2554d" />
              </mesh>
            )
          })}

          <Text
            position={[0, 4.5, -6]}
            color="#5a3b34"
            fontSize={0.28}
            anchorX="center"
            anchorY="middle"
            maxWidth={8}
            textAlign="center"
          >
            {`debug: seed=${usedMeta.seedText}\nfloorCells=${mesh.stats.floorCells}, floorMeshes=${mesh.stats.floorMeshes}, wallMeshes=${mesh.stats.wallMeshes}, artworks=${Array.isArray(artworks) ? artworks.length : 'loading'}`}
          </Text>
        </>
      ) : null}
    </group>
  )
}
