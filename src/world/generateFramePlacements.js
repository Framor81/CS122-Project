/**
 * Group adjacent collinear wall cell-segments coming out of `meshFromGrid`
 * into long continuous wall "runs", then place picture frames + plaques on
 * those runs. Placement is driven by the user's artwork collection: one
 * frame per artwork, distributed across the largest available walls so that
 * a single artwork lands on a prominent wall and nothing repeats.
 *
 * If no artworks are provided we fall back to the procedural "empty frames"
 * pack that we used before, so the room never looks empty during dev.
 */

import { debugReport } from '../lib/debugBus.js'

const FLOOR_THICKNESS = 0.12
const WALL_HEIGHT = 7.8

// Base frame + plaque dimensions (world units / meters).
const FRAME_WIDTH = 1.2
const FRAME_HEIGHT = 1.7
const FRAME_DEPTH = 0.06
const PICTURE_INSET = 0.08
const PICTURE_DEPTH = 0.012

const PLAQUE_WIDTH = 0.56
const PLAQUE_HEIGHT = 0.48
const PLAQUE_DEPTH = 0.025
const PLAQUE_GAP = 0.18 // horizontal gap between frame edge and plaque

// Spacing/clearance.
const EDGE_PAD = 0.45 // keep this far from a wall run's end (corner clearance)
const FRAME_GAP = 0.65 // gap between adjacent placement units along the wall

const MIN_SCALE = 1
const MAX_SCALE = 3
const MIN_UNIT_WIDTH = FRAME_WIDTH + PLAQUE_GAP + PLAQUE_WIDTH * 2

const EPS = 1e-4

function keyForRun(wall) {
  // Same axis + same perpendicular line + same inward normal => same wall run.
  const perp = wall.axis === 'x' ? wall.center[2] : wall.center[0]
  const nrm = wall.axis === 'x' ? wall.normal[2] : wall.normal[0]
  return `${wall.axis}|${perp.toFixed(3)}|${nrm > 0 ? '+' : '-'}`
}

/**
 * Merge collinear wall segments (sharing axis/perp/normal) that are touching
 * along the wall axis into runs of [startAlong, endAlong].
 */
function buildRuns(walls) {
  const buckets = new Map()
  for (const wall of walls) {
    const k = keyForRun(wall)
    let bucket = buckets.get(k)
    if (!bucket) {
      bucket = { axis: wall.axis, normal: wall.normal, perp: 0, segments: [] }
      bucket.perp = wall.axis === 'x' ? wall.center[2] : wall.center[0]
      buckets.set(k, bucket)
    }
    const along = wall.axis === 'x' ? wall.center[0] : wall.center[2]
    const halfLen = wall.axis === 'x' ? wall.size[0] / 2 : wall.size[2] / 2
    bucket.segments.push({ start: along - halfLen, end: along + halfLen })
  }

  const runs = []
  for (const bucket of buckets.values()) {
    bucket.segments.sort((a, b) => a.start - b.start)
    let current = null
    for (const seg of bucket.segments) {
      if (!current) {
        current = { ...seg }
        continue
      }
      if (seg.start <= current.end + EPS) {
        if (seg.end > current.end) current.end = seg.end
      } else {
        runs.push({
          axis: bucket.axis,
          normal: bucket.normal,
          perp: bucket.perp,
          start: current.start,
          end: current.end,
        })
        current = { ...seg }
      }
    }
    if (current) {
      runs.push({
        axis: bucket.axis,
        normal: bucket.normal,
        perp: bucket.perp,
        start: current.start,
        end: current.end,
      })
    }
  }
  return runs
}

function hash01(seedA, seedB) {
  // Fast deterministic pseudo-random in [0, 1) from two integer-ish seeds.
  const x = Math.sin(seedA * 12.9898 + seedB * 78.233) * 43758.5453123
  return x - Math.floor(x)
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Pick a frame size for a run + slot. If `aspect` (= imageW / imageH) is
 * provided we orient the frame to match the image and snap dimensions so the
 * frame matches the image aspect ratio exactly.
 */
function sampleVariant(run, slot, opts = {}) {
  const seed0 = Math.round(run.start * 100) + Math.round(run.end * 100)
  const seed1 = Math.round(run.perp * 100) + slot * 17 + (run.axis === 'x' ? 31 : 53)
  const tScale = hash01(seed0, seed1)

  const aspect = Number.isFinite(opts.aspect) && opts.aspect > 0 ? opts.aspect : null

  let horizontal
  if (aspect) {
    horizontal = aspect >= 1
  } else {
    const tOrient = hash01(seed0 + 19, seed1 + 7)
    horizontal = tOrient < 0.45
  }

  const scale = MIN_SCALE + tScale * (MAX_SCALE - MIN_SCALE)

  let frameWidth
  let frameHeight
  if (aspect) {
    // Lock dimensions to the image aspect. Pick the long edge from the base
    // size and derive the other so the frame snugly fits the picture.
    const longBase = Math.max(FRAME_WIDTH, FRAME_HEIGHT) * scale
    if (horizontal) {
      frameWidth = longBase
      frameHeight = frameWidth / aspect
    } else {
      frameHeight = longBase
      frameWidth = frameHeight * aspect
    }
  } else {
    const baseW = horizontal ? FRAME_HEIGHT : FRAME_WIDTH
    const baseH = horizontal ? FRAME_WIDTH : FRAME_HEIGHT
    frameWidth = baseW * scale
    frameHeight = baseH * scale
  }

  // Plaques are always at least 2x the original dimensions and also grow with
  // larger frames so proportion stays visually coherent.
  const plaqueScale = Math.max(2, scale)
  const plaqueWidth = PLAQUE_WIDTH * plaqueScale
  const plaqueHeight = PLAQUE_HEIGHT * plaqueScale
  const plaqueDepth = PLAQUE_DEPTH * plaqueScale

  return {
    scale,
    horizontal,
    frameWidth,
    frameHeight,
    plaqueWidth,
    plaqueHeight,
    plaqueDepth,
    unitWidth: frameWidth + PLAQUE_GAP + plaqueWidth,
  }
}

function makeId(run, idx, suffix = '') {
  const a = run.axis
  const n = run.normal[0] + run.normal[2]
  const tail = suffix ? `-${suffix}` : ''
  return `frame-${a}-${run.perp.toFixed(2)}-${n > 0 ? 'p' : 'n'}-${run.start.toFixed(2)}-${idx}${tail}`
}

function getPlaqueCopy(art) {
  if (!art) {
    return { title: 'Untitled', artist: '', description: '', caption: '' }
  }
  const title =
    (art.title || '').trim() || (art.status === 'pending' ? 'Identifying…' : 'Untitled')
  const artist = (art.artist || '').trim()
  const description = (art.description || '').trim()
  const caption = (art.caption || '').trim()
  return { title, artist, description, caption }
}

function plaqueTextFromCopy(copy) {
  const lines = [copy.title, copy.artist || 'Artist unknown']
  if (copy.description) lines.push(copy.description)
  return lines.join('\n')
}

/**
 * Build a placement on a specific run for a specific artwork (or empty slot).
 * Returns null if the unit cannot fit on the run.
 */
function placeOnRun(run, art, opts) {
  const wallHeight = opts.wallHeight ?? WALL_HEIGHT
  const floorThickness = opts.floorThickness ?? FLOOR_THICKNESS
  const wallThickness = opts.wallThickness ?? 0.22
  const targetCenterY = floorThickness + wallHeight * 0.25
  const minBottomY = floorThickness + wallHeight * 0.1

  const usableStart = run.start + EDGE_PAD
  const usableEnd = run.end - EDGE_PAD
  const usableLen = usableEnd - usableStart
  if (usableLen <= 0) return null

  const aspect = art?.aspect && Number.isFinite(art.aspect) && art.aspect > 0 ? art.aspect : null
  let variant = sampleVariant(run, 0, { aspect })

  // If the chosen variant doesn't fit, shrink the frame (and plaque) to fit
  // the wall while keeping aspect, down to a minimum.
  if (variant.unitWidth > usableLen + EPS) {
    const minLong = Math.max(FRAME_WIDTH, FRAME_HEIGHT) * MIN_SCALE
    const longBase = aspect
      ? variant.horizontal
        ? variant.frameWidth
        : variant.frameHeight
      : Math.max(variant.frameWidth, variant.frameHeight)
    const otherBase = aspect
      ? variant.horizontal
        ? variant.frameHeight
        : variant.frameWidth
      : Math.min(variant.frameWidth, variant.frameHeight)
    // Solve for a shrink factor `k` such that
    //   k * longBase + PLAQUE_GAP + (PLAQUE_WIDTH * max(2, k * scale)) <= usableLen.
    // Plaque scale uses max(2, scale*k); when k*scale < 2 it locks to 2 so the
    // plaque term becomes constant. Solve both branches and pick the one that
    // works.
    const plaqueConst = PLAQUE_WIDTH * 2
    let k = Math.min(1, (usableLen - PLAQUE_GAP - plaqueConst) / longBase)
    if (!Number.isFinite(k) || k <= 0) return null
    if (k * variant.scale < 2) {
      // plaque is locked to 2x
      // already solved above
    } else {
      // plaque scale = k * scale, so:
      //   k*longBase + PLAQUE_GAP + PLAQUE_WIDTH * k * scale = usableLen
      const denom = longBase + PLAQUE_WIDTH * variant.scale
      k = denom > 0 ? (usableLen - PLAQUE_GAP) / denom : k
    }
    if (!(k > 0)) return null
    const shrunkLong = k * longBase
    if (shrunkLong < minLong * 0.6) return null
    const shrunkOther = otherBase * (shrunkLong / longBase)
    const newFrameWidth = variant.horizontal ? shrunkLong : shrunkOther
    const newFrameHeight = variant.horizontal ? shrunkOther : shrunkLong
    const plaqueScale = Math.max(2, variant.scale * (shrunkLong / longBase))
    variant = {
      ...variant,
      frameWidth: newFrameWidth,
      frameHeight: newFrameHeight,
      plaqueWidth: PLAQUE_WIDTH * plaqueScale,
      plaqueHeight: PLAQUE_HEIGHT * plaqueScale,
      plaqueDepth: PLAQUE_DEPTH * plaqueScale,
      unitWidth: newFrameWidth + PLAQUE_GAP + PLAQUE_WIDTH * plaqueScale,
    }
    if (variant.unitWidth > usableLen + EPS) return null
  }

  const yaw =
    run.axis === 'x'
      ? run.normal[2] > 0
        ? 0
        : Math.PI
      : run.normal[0] > 0
        ? Math.PI / 2
        : -Math.PI / 2
  const frameOffsetFromWall = wallThickness / 2 + FRAME_DEPTH / 2 + 0.002

  // Center the unit on the wall run.
  const center = (usableStart + usableEnd) / 2
  const unitStart = center - variant.unitWidth / 2
  const frameAlong = unitStart + variant.frameWidth / 2
  const plaqueAlong = unitStart + variant.frameWidth + PLAQUE_GAP + variant.plaqueWidth / 2

  const minCenterY = minBottomY + variant.frameHeight / 2
  const maxCenterY = floorThickness + wallHeight - variant.frameHeight / 2 - 0.05
  const frameCenterY = clamp(targetCenterY, minCenterY, maxCenterY)

  let frameX
  let frameZ
  let plaqueX
  let plaqueZ
  if (run.axis === 'x') {
    frameX = frameAlong
    frameZ = run.perp + run.normal[2] * frameOffsetFromWall
    plaqueX = plaqueAlong
    plaqueZ = frameZ
  } else {
    frameZ = frameAlong
    frameX = run.perp + run.normal[0] * frameOffsetFromWall
    plaqueZ = plaqueAlong
    plaqueX = frameX
  }

  const copy = getPlaqueCopy(art)

  return {
    id: makeId(run, 0, art?.id || 'empty'),
    artwork: art || null,
    frame: {
      position: [frameX, frameCenterY, frameZ],
      rotation: [0, yaw, 0],
      width: variant.frameWidth,
      height: variant.frameHeight,
      depth: FRAME_DEPTH,
      pictureInset: PICTURE_INSET,
      pictureDepth: PICTURE_DEPTH,
      horizontal: variant.horizontal,
      scale: variant.scale,
      aspect,
    },
    plaque: {
      position: [plaqueX, frameCenterY - variant.frameHeight * 0.25, plaqueZ],
      rotation: [0, yaw, 0],
      width: variant.plaqueWidth,
      height: variant.plaqueHeight,
      depth: variant.plaqueDepth,
      text: plaqueTextFromCopy(copy) || `Untitled`,
      title: copy.title,
      artist: copy.artist,
      description: copy.description,
      caption: copy.caption,
    },
    run: {
      axis: run.axis,
      length: run.end - run.start,
      startAlong: usableStart,
    },
  }
}

/**
 * Procedural fallback (original behavior): pack as many empty frames as a
 * run can hold. Used when no artworks are available.
 */
function packEmptyRun(run, opts) {
  const wallHeight = opts.wallHeight ?? WALL_HEIGHT
  const floorThickness = opts.floorThickness ?? FLOOR_THICKNESS
  const wallThickness = opts.wallThickness ?? 0.22
  const targetCenterY = floorThickness + wallHeight * 0.25
  const minBottomY = floorThickness + wallHeight * 0.1

  const usableStart = run.start + EDGE_PAD
  const usableEnd = run.end - EDGE_PAD
  const usableLen = usableEnd - usableStart
  if (usableLen <= 0) return []

  const yaw =
    run.axis === 'x'
      ? run.normal[2] > 0
        ? 0
        : Math.PI
      : run.normal[0] > 0
        ? Math.PI / 2
        : -Math.PI / 2
  const frameOffsetFromWall = wallThickness / 2 + FRAME_DEPTH / 2 + 0.002

  const units = []
  let cursor = 0
  let slot = 0
  while (slot < 2048) {
    const variant = sampleVariant(run, slot)
    if (cursor + variant.unitWidth > usableLen + EPS) break
    units.push({ slot, ...variant, localStart: cursor })
    cursor += variant.unitWidth + FRAME_GAP
    slot += 1
  }
  if (!units.length && usableLen + EPS >= MIN_UNIT_WIDTH) {
    units.push({
      slot: 0,
      scale: 1,
      horizontal: false,
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
      plaqueWidth: PLAQUE_WIDTH * 2,
      plaqueHeight: PLAQUE_HEIGHT * 2,
      plaqueDepth: PLAQUE_DEPTH * 2,
      unitWidth: MIN_UNIT_WIDTH,
      localStart: 0,
    })
    cursor = MIN_UNIT_WIDTH + FRAME_GAP
  }
  if (!units.length) return []

  const packedSpan = cursor - FRAME_GAP
  const packOffset = (usableLen - packedSpan) / 2
  const out = []

  for (let i = 0; i < units.length; i += 1) {
    const unit = units[i]
    const unitStart = usableStart + packOffset + unit.localStart
    const frameAlong = unitStart + unit.frameWidth / 2
    const plaqueAlong = unitStart + unit.frameWidth + PLAQUE_GAP + unit.plaqueWidth / 2

    const minCenterY = minBottomY + unit.frameHeight / 2
    const maxCenterY = floorThickness + wallHeight - unit.frameHeight / 2 - 0.05
    const frameCenterY = clamp(targetCenterY, minCenterY, maxCenterY)

    let frameX
    let frameZ
    let plaqueX
    let plaqueZ
    if (run.axis === 'x') {
      frameX = frameAlong
      frameZ = run.perp + run.normal[2] * frameOffsetFromWall
      plaqueX = plaqueAlong
      plaqueZ = frameZ
    } else {
      frameZ = frameAlong
      frameX = run.perp + run.normal[0] * frameOffsetFromWall
      plaqueZ = plaqueAlong
      plaqueX = frameX
    }

    out.push({
      id: makeId(run, i),
      artwork: null,
      frame: {
        position: [frameX, frameCenterY, frameZ],
        rotation: [0, yaw, 0],
        width: unit.frameWidth,
        height: unit.frameHeight,
        depth: FRAME_DEPTH,
        pictureInset: PICTURE_INSET,
        pictureDepth: PICTURE_DEPTH,
        horizontal: unit.horizontal,
        scale: unit.scale,
        aspect: null,
      },
      plaque: {
        position: [plaqueX, frameCenterY - unit.frameHeight * 0.25, plaqueZ],
        rotation: [0, yaw, 0],
        width: unit.plaqueWidth,
        height: unit.plaqueHeight,
        depth: unit.plaqueDepth,
        text: `Untitled`,
      },
      run: {
        axis: run.axis,
        length: run.end - run.start,
        startAlong: usableStart + packOffset,
      },
    })
  }
  return out
}

/**
 * Build the placement list.
 *
 * @param walls   - wall objects from meshFromGrid (must include axis/normal)
 * @param options.wallHeight, floorThickness, wallThickness
 * @param options.artworks - optional array of artworks, each with at least
 *        { id, imageUrl, aspect?, title?, artist?, date_text?, medium?, dimensions? }.
 *        When provided, exactly one frame per artwork is placed, biggest walls
 *        first, until the collection is exhausted. If empty/undefined, falls
 *        back to procedural empty-frame packing.
 */
/**
 * How many artworks can fit on this museum mesh (one per wall run), using a
 * nominal aspect ratio. Mirrors placement rules in generateFramePlacements.
 */
export function estimatePlaceableArtworkCount(walls, options = {}) {
  if (!Array.isArray(walls) || walls.length === 0) return 0

  const runs = buildRuns(walls)
  runs.sort((a, b) => b.end - b.start - (a.end - a.start))

  const placeholderArt = { id: '__capacity__', aspect: 1 }
  let count = 0
  for (const run of runs) {
    const placement = placeOnRun(run, placeholderArt, options)
    if (placement) count += 1
  }
  return count
}

export function generateFramePlacements(walls, options = {}) {
  if (!Array.isArray(walls) || walls.length === 0) return []

  const runs = buildRuns(walls)
  // Largest runs first so a single artwork lands somewhere prominent.
  runs.sort((a, b) => b.end - b.start - (a.end - a.start))

  const artworks = Array.isArray(options.artworks) ? options.artworks : null

  if (!artworks || artworks.length === 0) {
    if (artworks && artworks.length === 0) {
      debugReport(
        `Museum: no artworks in collection — showing ${runs.length} walls of empty frames.`,
        'warn',
      )
    }
    const placements = []
    for (const run of runs) {
      placements.push(...packEmptyRun(run, options))
    }
    return placements
  }

  const placements = []
  let queueIdx = 0
  let skippedRuns = 0
  for (const run of runs) {
    if (queueIdx >= artworks.length) break
    const art = artworks[queueIdx]
    const placement = placeOnRun(run, art, options)
    if (placement) {
      placements.push(placement)
      queueIdx += 1
    } else {
      skippedRuns += 1
    }
  }

  if (queueIdx < artworks.length) {
    const remaining = artworks.length - queueIdx
    debugReport(
      `Museum: ${remaining} artwork(s) had no wall large enough to fit (skippedRuns=${skippedRuns}).`,
      'warn',
    )
  } else if (skippedRuns > 0) {
    debugReport(
      `Museum: placed ${placements.length} artwork(s); ${skippedRuns} wall run(s) were too small to host any artwork.`,
      'info',
    )
  } else {
    debugReport(
      `Museum: placed ${placements.length} artwork(s) across ${runs.length} wall run(s).`,
      'info',
    )
  }

  return placements
}

export const FRAME_LAYOUT_CONSTANTS = {
  FRAME_WIDTH,
  FRAME_HEIGHT,
  FRAME_DEPTH,
  PICTURE_INSET,
  PICTURE_DEPTH,
  PLAQUE_WIDTH,
  PLAQUE_HEIGHT,
  PLAQUE_DEPTH,
  PLAQUE_GAP,
  EDGE_PAD,
  FRAME_GAP,
  MIN_SCALE,
  MAX_SCALE,
  MIN_UNIT_WIDTH,
}
