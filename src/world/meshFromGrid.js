import { CELL_FLOOR } from './grid/Grid.js'

function greedyRects(grid) {
  const visited = new Uint8Array(grid.width * grid.height)
  const rects = []

  const markVisited = (x0, z0, x1, z1) => {
    for (let z = z0; z <= z1; z += 1) {
      for (let x = x0; x <= x1; x += 1) {
        visited[z * grid.width + x] = 1
      }
    }
  }

  for (let z = 0; z < grid.height; z += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const idx = z * grid.width + x
      if (visited[idx] || grid.get(x, z) !== CELL_FLOOR) continue

      let maxX = x
      while (
        maxX + 1 < grid.width &&
        !visited[z * grid.width + (maxX + 1)] &&
        grid.get(maxX + 1, z) === CELL_FLOOR
      ) {
        maxX += 1
      }

      let maxZ = z
      let canGrow = true
      while (canGrow && maxZ + 1 < grid.height) {
        for (let tx = x; tx <= maxX; tx += 1) {
          if (
            visited[(maxZ + 1) * grid.width + tx] ||
            grid.get(tx, maxZ + 1) !== CELL_FLOOR
          ) {
            canGrow = false
            break
          }
        }
        if (canGrow) maxZ += 1
      }

      markVisited(x, z, maxX, maxZ)
      rects.push({ x0: x, z0: z, x1: maxX, z1: maxZ })
    }
  }

  return rects
}

export function meshFromGrid(grid, params = {}) {
  const floorThickness = params.floorThickness ?? 0.12
  const wallHeight = params.wallHeight ?? 7.8
  const wallThickness = params.wallThickness ?? 0.22
  const ceilingThickness = params.ceilingThickness ?? 0.1

  const floors = []
  const walls = []
  const ceilings = []

  const floorRects = greedyRects(grid)
  for (const r of floorRects) {
    const widthCells = r.x1 - r.x0 + 1
    const depthCells = r.z1 - r.z0 + 1
    const [wx0, wz0] = grid.cellToWorld(r.x0, r.z0)
    const [wx1, wz1] = grid.cellToWorld(r.x1, r.z1)
    floors.push({
      center: [(wx0 + wx1) / 2, floorThickness / 2, (wz0 + wz1) / 2],
      size: [widthCells * grid.cellSize, floorThickness, depthCells * grid.cellSize],
    })

    ceilings.push({
      center: [
        (wx0 + wx1) / 2,
        floorThickness + wallHeight + ceilingThickness / 2,
        (wz0 + wz1) / 2,
      ],
      size: [widthCells * grid.cellSize, ceilingThickness, depthCells * grid.cellSize],
    })
  }

  const wallY = floorThickness + wallHeight / 2
  const cs = grid.cellSize
  for (let z = 0; z < grid.height; z += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      if (grid.get(x, z) !== CELL_FLOOR) continue
      const [wx, wz] = grid.cellToWorld(x, z)

      if (grid.get(x, z - 1) !== CELL_FLOOR) {
        walls.push({
          center: [wx, wallY, wz - cs / 2],
          size: [cs, wallHeight, wallThickness],
        })
      }
      if (grid.get(x, z + 1) !== CELL_FLOOR) {
        walls.push({
          center: [wx, wallY, wz + cs / 2],
          size: [cs, wallHeight, wallThickness],
        })
      }
      if (grid.get(x - 1, z) !== CELL_FLOOR) {
        walls.push({
          center: [wx - cs / 2, wallY, wz],
          size: [wallThickness, wallHeight, cs],
        })
      }
      if (grid.get(x + 1, z) !== CELL_FLOOR) {
        walls.push({
          center: [wx + cs / 2, wallY, wz],
          size: [wallThickness, wallHeight, cs],
        })
      }
    }
  }

  let floorCellCount = 0
  grid.forEach((_, __, cell) => {
    if (cell === CELL_FLOOR) floorCellCount += 1
  })

  return {
    floors,
    walls,
    ceilings,
    stats: {
      floorCells: floorCellCount,
      floorMeshes: floors.length,
      wallMeshes: walls.length,
      ceilingMeshes: ceilings.length,
    },
  }
}
