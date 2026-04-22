import { Text } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { generateMuseumGrid } from './generateMuseumGrid.js'
import { meshFromGrid } from './meshFromGrid.js'

const FLOOR_COLOR = '#ead9cf'
const WALL_COLOR_A = '#f4ebe4'
const WALL_COLOR_B = '#f2e7de'

function pickArtworkPlacements(walls, artworks) {
  const usableWalls = walls.filter((wall) => Math.max(wall.size[0], wall.size[2]) >= 2.1)
  if (!usableWalls.length || !artworks?.length) return []

  return artworks.slice(0, Math.min(artworks.length, usableWalls.length)).map((art, idx) => {
    const wall = usableWalls[(idx * 7) % usableWalls.length]
    const runsAlongX = wall.size[0] >= wall.size[2]
    const longSide = runsAlongX ? wall.size[0] : wall.size[2]
    const width = Math.min(2.6, Math.max(1.45, longSide * 0.58))
    const height = Math.min(1.9, width * 0.72)

    if (runsAlongX) {
      const normal = wall.center[2] >= 0 ? -1 : 1
      return {
        art,
        position: [wall.center[0], 2.65, wall.center[2] + normal * 0.14],
        rotation: [0, normal > 0 ? 0 : Math.PI, 0],
        width,
        height,
      }
    }

    const normal = wall.center[0] >= 0 ? -1 : 1
    return {
      art,
      position: [wall.center[0] + normal * 0.14, 2.65, wall.center[2]],
      rotation: [0, normal > 0 ? Math.PI / 2 : -Math.PI / 2, 0],
      width,
      height,
    }
  })
}

function ArtworkFrame({ placement }) {
  const { art, height, position, rotation, width } = placement
  const [texture, setTexture] = useState(null)

  useEffect(() => {
    if (!art.imageUrl) {
      queueMicrotask(() => {
        setTexture(null)
      })
      return undefined
    }

    let cancelled = false
    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      art.imageUrl,
      (nextTexture) => {
        if (cancelled) {
          nextTexture.dispose()
          return
        }
        nextTexture.colorSpace = THREE.SRGBColorSpace
        setTexture(nextTexture)
      },
      undefined,
      () => {
        if (!cancelled) setTexture(null)
      },
    )

    return () => {
      cancelled = true
    }
  }, [art.imageUrl])

  useEffect(() => {
    return () => {
      texture?.dispose()
    }
  }, [texture])

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.018]}>
        <boxGeometry args={[width + 0.2, height + 0.2, 0.08]} />
        <meshStandardMaterial color="#5b3c32" roughness={0.78} />
      </mesh>
      <mesh>
        <planeGeometry args={[width, height]} />
        {texture ? (
          <meshStandardMaterial map={texture} roughness={0.82} />
        ) : (
          <meshStandardMaterial color="#dfcabd" roughness={0.9} />
        )}
      </mesh>
      <Text
        position={[0, -height / 2 - 0.18, 0.025]}
        color="#5a3b34"
        fontSize={0.13}
        anchorX="center"
        anchorY="middle"
        maxWidth={width}
        textAlign="center"
      >
        {art.title || (art.status === 'pending' ? 'Identifying...' : 'Untitled')}
      </Text>
    </group>
  )
}

export function MuseumLayout({
  seed = 'museum-seed-alpha',
  grid,
  meta,
  artworks = [],
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

  const artworkPlacements = useMemo(
    () => pickArtworkPlacements(mesh.walls, artworks),
    [artworks, mesh.walls],
  )

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

      {artworkPlacements.map((placement) => (
        <ArtworkFrame key={placement.art.id} placement={placement} />
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
            {`debug: seed=${usedMeta.seedText}\nfloorCells=${mesh.stats.floorCells}, floorMeshes=${mesh.stats.floorMeshes}, wallMeshes=${mesh.stats.wallMeshes}, artworks=${artworkPlacements.length}`}
          </Text>
        </>
      ) : null}
    </group>
  )
}
