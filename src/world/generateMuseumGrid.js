import { Grid } from './grid/Grid.js'
import {
  carveCorridorSegment,
  carveRect,
  fillRatioInRect,
} from './grid/carve.js'

function hashString(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function createRng(seed) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1))
}

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
]

function clampToOdd(n) {
  return n % 2 === 0 ? n + 1 : n
}

function chooseTurn(rng) {
  // Return a small turn delta for the DIR index update.
  // -1 is represented as 3 due to modulo arithmetic.
  return rng() > 0.5 ? 1 : 3
}

export function generateMuseumGrid(seedText = 'museum-seed-alpha') {
  const seed = hashString(seedText)
  const rng = createRng(seed)

  // Larger museum footprint (more halls/rooms) while keeping `cellSize`
  // constant, so all room/hall dimensions in meters remain unchanged.
  // "800x800" here refers to the cell grid size.
  const grid = new Grid(800, 800, 0.5)
  // Hall thickness target:
  // - baseline was ~2.4m (≈ 3 capsule diameters at 0.8m each)
  // - requested: 3× wider => ~7.2m
  const corridorWidthCells = clampToOdd(Math.round(7.2 / grid.cellSize))
  const margin = 20

  const meta = {
    corridorWidthCells,
    segments: [],
    rooms: [],
    seedText,
    gridWidth: grid.width,
    gridHeight: grid.height,
    cellSize: grid.cellSize,
  }

  // Entrance: always a singular doorway on the "south" side.
  // We carve an outside approach strip into FLOOR so the player can spawn "in front".
  const entranceSide = 'south'
  const entranceXCenter = Math.floor(
    grid.width / 2 + (rng() - 0.5) * 20,
  )
  const entranceZStart = margin
  const outsideZMax = margin - 1

  // Outside approach strip
  const halfW = Math.floor(corridorWidthCells / 2)
  carveRect(
    grid,
    entranceXCenter - halfW,
    0,
    entranceXCenter + halfW,
    outsideZMax,
  )
  // Ensure a corridor-like width at the doorway row too.
  carveRect(
    grid,
    entranceXCenter - halfW,
    entranceZStart,
    entranceXCenter + halfW,
    entranceZStart,
  )

  // Spawn a bit in front of the entrance (outside direction is -Z).
  const spawnCellZ = outsideZMax - 2
  const [spawnX, spawnZ] = grid.cellToWorld(entranceXCenter, spawnCellZ)

  meta.entrance = {
    side: entranceSide,
    cell: { x: entranceXCenter, z: entranceZStart },
    spawnWorld: { x: spawnX, z: spawnZ },
  }

  let x = entranceXCenter
  let z = entranceZStart
  let dir = 1 // +z
  let lastDir = dir

  // Increase corridor segment count proportionally with the grid size so
  // the larger footprint is actually filled.
  const baseGridWidthForSegments = 360
  const baseSegmentsCount = 18
  const segmentsCount = Math.max(
    baseSegmentsCount,
    Math.round(baseSegmentsCount * (grid.width / baseGridWidthForSegments)),
  )

  for (let i = 0; i < segmentsCount; i += 1) {
    const len = randInt(rng, 12, 28)
    const [dx, dz] = DIRS[dir]
    let x1 = x + dx * len
    let z1 = z + dz * len

    // Keep the building inside the interior bounds (except the entrance strip already carved).
    if (
      x1 < margin ||
      z1 < margin ||
      x1 > grid.width - margin - 1 ||
      z1 > grid.height - margin - 1
    ) {
      // Bounce by choosing a different turn.
      dir = (dir + chooseTurn(rng) + 4) % 4
      const [ndx, ndz] = DIRS[dir]
      x1 = x + ndx * Math.floor(len * 0.6)
      z1 = z + ndz * Math.floor(len * 0.6)
    }

    carveCorridorSegment(grid, x, z, x1, z1, corridorWidthCells)
    meta.segments.push({ x0: x, z0: z, x1, z1 })
    x = x1
    z = z1

    if (i % 2 === 1) {
      // No circular rooms: only rectangular exhibit rooms.
      const roomKind = 'rect'
      const [rdx, rdz] = DIRS[dir]
      const sideSign = rng() > 0.5 ? 1 : -1
      const nx = -rdz * sideSign
      const nz = rdx * sideSign

      if (roomKind === 'rect') {
        const rw = randInt(rng, 12, 26)
        const rh = randInt(rng, 12, 24)
        const centerX = x + nx * Math.floor(rw * 0.6)
        const centerZ = z + nz * Math.floor(rh * 0.6)
        const minX = centerX - Math.floor(rw / 2)
        const maxX = centerX + Math.floor(rw / 2)
        const minZ = centerZ - Math.floor(rh / 2)
        const maxZ = centerZ + Math.floor(rh / 2)
        const overlap = fillRatioInRect(grid, minX, minZ, maxX, maxZ)
        if (overlap <= 0.18) {
          carveRect(grid, minX, minZ, maxX, maxZ)
          const doorHalf = Math.floor(corridorWidthCells / 2)
          carveRect(grid, x - doorHalf, z - doorHalf, x + doorHalf, z + doorHalf)
          meta.rooms.push({ type: 'rect', minX, minZ, maxX, maxZ })
        }
      } else {
        // unreachable by design (roomKind forced to 'rect')
      }
    }

    const r = rng()
    if (r < 0.3) {
      // straight
    } else if (r < 0.65) {
      dir = (dir + 1) % 4
    } else {
      dir = (dir + 3) % 4
    }
    if (dir === (lastDir + 2) % 4) dir = lastDir
    lastDir = dir
  }

  return { grid, meta }
}
