import { CELL_FLOOR } from './Grid.js'

export function carveRect(grid, minX, minZ, maxX, maxZ) {
  const x0 = Math.max(0, Math.min(minX, maxX))
  const x1 = Math.min(grid.width - 1, Math.max(minX, maxX))
  const z0 = Math.max(0, Math.min(minZ, maxZ))
  const z1 = Math.min(grid.height - 1, Math.max(minZ, maxZ))

  for (let z = z0; z <= z1; z += 1) {
    for (let x = x0; x <= x1; x += 1) {
      grid.set(x, z, CELL_FLOOR)
    }
  }
}

export function carveCircle(grid, cx, cz, radiusCells) {
  const r2 = radiusCells * radiusCells
  const minX = Math.floor(cx - radiusCells)
  const maxX = Math.ceil(cx + radiusCells)
  const minZ = Math.floor(cz - radiusCells)
  const maxZ = Math.ceil(cz + radiusCells)

  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - cx
      const dz = z - cz
      if (dx * dx + dz * dz <= r2) {
        grid.set(x, z, CELL_FLOOR)
      }
    }
  }
}

export function carveCorridorSegment(grid, x0, z0, x1, z1, widthCells) {
  const half = Math.floor(widthCells / 2)
  if (x0 === x1) {
    carveRect(grid, x0 - half, Math.min(z0, z1), x0 + half, Math.max(z0, z1))
    return
  }
  carveRect(grid, Math.min(x0, x1), z0 - half, Math.max(x0, x1), z0 + half)
}

export function fillRatioInRect(grid, minX, minZ, maxX, maxZ) {
  let filled = 0
  let total = 0
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!grid.inBounds(x, z)) return 1
      total += 1
      if (grid.get(x, z) === CELL_FLOOR) filled += 1
    }
  }
  return total > 0 ? filled / total : 1
}
