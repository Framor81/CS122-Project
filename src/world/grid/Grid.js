export const CELL_WALL = 0
export const CELL_FLOOR = 1

export class Grid {
  constructor(width, height, cellSize = 0.5) {
    this.width = width
    this.height = height
    this.cellSize = cellSize
    this.cells = new Uint8Array(width * height)
  }

  inBounds(x, z) {
    return x >= 0 && z >= 0 && x < this.width && z < this.height
  }

  index(x, z) {
    return z * this.width + x
  }

  get(x, z) {
    if (!this.inBounds(x, z)) return CELL_WALL
    return this.cells[this.index(x, z)]
  }

  set(x, z, value) {
    if (!this.inBounds(x, z)) return
    this.cells[this.index(x, z)] = value
  }

  forEach(callback) {
    for (let z = 0; z < this.height; z += 1) {
      for (let x = 0; x < this.width; x += 1) {
        callback(x, z, this.cells[this.index(x, z)])
      }
    }
  }

  cellToWorld(x, z) {
    const worldX = (x - this.width / 2 + 0.5) * this.cellSize
    const worldZ = (z - this.height / 2 + 0.5) * this.cellSize
    return [worldX, worldZ]
  }

  worldToCell(worldX, worldZ) {
    const cellX = Math.floor(worldX / this.cellSize + this.width / 2)
    const cellZ = Math.floor(worldZ / this.cellSize + this.height / 2)
    return { cellX, cellZ }
  }
}
