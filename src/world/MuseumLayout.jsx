import { Text } from '@react-three/drei'
import { useMemo } from 'react'
import { generateMuseumGrid } from './generateMuseumGrid.js'
import { meshFromGrid } from './meshFromGrid.js'

const FLOOR_COLOR = '#ead9cf'
const WALL_COLOR_A = '#f4ebe4'
const WALL_COLOR_B = '#f2e7de'

export function MuseumLayout({
  seed = 'museum-seed-alpha',
  grid,
  meta,
  debug = false,
}) {
  const { mesh, usedMeta } = useMemo(() => {
    const generated = grid && meta ? { grid, meta } : generateMuseumGrid(seed)
    return {
      mesh: meshFromGrid(generated.grid, {
        floorThickness: 0.12,
        wallHeight: 7.8,
        wallThickness: 0.22,
        ceilingThickness: 0.1,
      }),
      usedMeta: generated.meta,
    }
  }, [seed, grid, meta])

  return (
    <group>
      {mesh.floors.map((f, idx) => (
        <mesh key={`f-${idx}`} position={f.center} receiveShadow>
          <boxGeometry args={f.size} />
          <meshStandardMaterial color={FLOOR_COLOR} roughness={0.95} />
        </mesh>
      ))}

      {mesh.walls.map((w, idx) => (
        <mesh key={`w-${idx}`} position={w.center} castShadow>
          <boxGeometry args={w.size} />
          <meshStandardMaterial
            color={idx % 2 === 0 ? WALL_COLOR_A : WALL_COLOR_B}
            roughness={0.9}
          />
        </mesh>
      ))}

      {mesh.ceilings.map((c, idx) => (
        <mesh key={`ceil-${idx}`} position={c.center} receiveShadow>
          <boxGeometry args={c.size} />
          <meshStandardMaterial color="#e3d5c6" roughness={0.98} />
        </mesh>
      ))}

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
            {`debug: seed=${usedMeta.seedText}\nfloorCells=${mesh.stats.floorCells}, floorMeshes=${mesh.stats.floorMeshes}, wallMeshes=${mesh.stats.wallMeshes}`}
          </Text>
        </>
      ) : null}
    </group>
  )
}
