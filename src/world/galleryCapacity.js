import { generateMuseumGrid } from './generateMuseumGrid.js'
import { meshFromGrid } from './meshFromGrid.js'
import { estimatePlaceableArtworkCount } from './generateFramePlacements.js'

const WALL_PARAMS = {
  floorThickness: 0.12,
  wallHeight: 7.8,
  wallThickness: 0.22,
}

/**
 * Max number of artworks that can be placed for this procedural museum seed/size.
 */
export function estimateMuseumArtworkCapacity(seedText, gridSize) {
  try {
    const { grid } = generateMuseumGrid(seedText, gridSize)
    const { walls } = meshFromGrid(grid, WALL_PARAMS)
    return estimatePlaceableArtworkCount(walls, WALL_PARAMS)
  } catch {
    return 0
  }
}
