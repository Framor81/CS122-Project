import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { CELL_FLOOR, CELL_WALL } from '../world/grid/Grid.js'

const CHICKEN_RADIUS = 0.35
const FLOOR_THICKNESS = 0.12
// Chicken position is the center of the sphere, so it should sit on top of the
// museum floor slab (whose top is at `floorThickness`).
const GROUND_Y = FLOOR_THICKNESS + CHICKEN_RADIUS
const WORLD_HALF = 56
const SPAWN_BASE_SECONDS = 2.4
const POP_LIFETIME = 1.0
const PLAYER_HIT_POP_LIFETIME = 0.42
const PLAYER_DEATH_POP_LIFETIME = 1.2
const BULLET_LIFETIME = 1.2
const BULLET_SPEED = 54
const BULLET_RADIUS = 0.09
const WALL_THICKNESS = 0.22
const WALL_HEIGHT = 7.8
const PLAYER_RADIUS = 0.4

const IMPACT_LIFETIME = 0.35
const IMPACT_RADIUS = 0.14
const MAG_SIZE = 12
const RESERVE_AMMO_START = 72
const RELOAD_SECONDS = 1.1

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function segmentIntersectSphere(p0, p1, c, r) {
  // Returns smallest t in [0,1] where segment p0->p1 intersects sphere, else null.
  const vx = p1.x - p0.x
  const vy = p1.y - p0.y
  const vz = p1.z - p0.z
  const wx = p0.x - c.x
  const wy = p0.y - c.y
  const wz = p0.z - c.z

  const a = vx * vx + vy * vy + vz * vz
  if (a < 1e-8) return null

  const b = 2 * (wx * vx + wy * vy + wz * vz)
  const cVal = wx * wx + wy * wy + wz * wz - r * r

  const disc = b * b - 4 * a * cVal
  if (disc < 0) return null

  const sqrtDisc = Math.sqrt(disc)
  const t1 = (-b - sqrtDisc) / (2 * a)
  const t2 = (-b + sqrtDisc) / (2 * a)

  const tCandidates = [t1, t2].filter((t) => t >= 0 && t <= 1)
  if (tCandidates.length === 0) return null

  return Math.min(...tCandidates)
}

function randomRange(min, max) {
  return min + Math.random() * (max - min)
}

function randomVelocity(speedMin, speedMax) {
  const angle = randomRange(0, Math.PI * 2)
  const speed = randomRange(speedMin, speedMax)
  return new THREE.Vector3(Math.cos(angle) * speed, 0, Math.sin(angle) * speed)
}

function randomSpawnPos() {
  return new THREE.Vector3(
    randomRange(-WORLD_HALF, WORLD_HALF),
    GROUND_Y,
    randomRange(-WORLD_HALF, WORLD_HALF),
  )
}

function randomSpawnPosOnMuseum(collisionGrid) {
  if (!collisionGrid) return randomSpawnPos()

  // Try random samples first (fast).
  const attempts = 300
  for (let i = 0; i < attempts; i += 1) {
    const x = Math.floor(Math.random() * collisionGrid.width)
    const z = Math.floor(Math.random() * collisionGrid.height)
    if (collisionGrid.get(x, z) !== CELL_FLOOR) continue
    const [wx, wz] = collisionGrid.cellToWorld(x, z)
    return new THREE.Vector3(wx, GROUND_Y, wz)
  }

  // Fallback: scan for the first floor tile.
  for (let z = 0; z < collisionGrid.height; z += 1) {
    for (let x = 0; x < collisionGrid.width; x += 1) {
      if (collisionGrid.get(x, z) !== CELL_FLOOR) continue
      const [wx, wz] = collisionGrid.cellToWorld(x, z)
      return new THREE.Vector3(wx, GROUND_Y, wz)
    }
  }

  // If the grid is malformed, revert to random.
  return randomSpawnPos()
}

const SPEED_SCALE = 0.85 // additional 15% slower

function createChicken(id, now, collisionGrid) {
  return {
    id,
    pos: randomSpawnPosOnMuseum(collisionGrid),
    vel: randomVelocity(6.5 * SPEED_SCALE, 10 * SPEED_SCALE),
    turnTimer: now + randomRange(0.8, 2.2),
  }
}

function createPopBurst(id, pos, bornAt) {
  const pieces = Array.from({ length: 8 }, () => ({
    vel: new THREE.Vector3(
      randomRange(-8.8, 8.8),
      randomRange(5.4, 11.2),
      randomRange(-8.8, 8.8),
    ),
    radius: randomRange(0.16, 0.28),
  }))
  return { id, bornAt, pos: pos.clone(), pieces }
}

function colorFromName(name) {
  const text = (typeof name === 'string' && name.trim()) || 'Visitor'
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const hue = ((hash >>> 0) % 360) / 360
  const sat = 0.52
  const light = 0.64
  const color = new THREE.Color()
  color.setHSL(hue, sat, light)
  return `#${color.getHexString()}`
}

function createPlayerHitBurst(id, pos, bornAt) {
  const pieces = Array.from({ length: 5 }, () => ({
    vel: new THREE.Vector3(
      randomRange(-2.8, 2.8),
      randomRange(2.2, 4.2),
      randomRange(-2.8, 2.8),
    ),
    radius: randomRange(0.06, 0.1),
  }))
  return { id, bornAt, pos: pos.clone(), pieces }
}

function createPlayerDeathBurst(id, pos, bornAt, color) {
  const pieces = Array.from({ length: 16 }, () => ({
    vel: new THREE.Vector3(
      randomRange(-10.5, 10.5),
      randomRange(6.4, 13.5),
      randomRange(-10.5, 10.5),
    ),
    radius: randomRange(0.24, 0.4),
  }))
  return { id, bornAt, pos: pos.clone(), pieces, color }
}

export function CombatLayer({
  muzzleRef,
  collisionGrid,
  playerStateRef,
  onGunStateChange,
  remotePlayers,
  localId,
  combatById,
  reportPlayerHit,
  hitEvents,
  deathEvents,
  localAlive = true,
}) {
  const { camera } = useThree()
  const chickensRef = useRef([])
  const bulletsRef = useRef([])
  const popsRef = useRef([])
  const impactsRef = useRef([])
  const playerHitPopsRef = useRef([])
  const playerDeathPopsRef = useRef([])
  const seenHitEventKeysRef = useRef(new Set())
  const seenDeathEventKeysRef = useRef(new Set())
  const nowRef = useRef(0)
  const nextIdRef = useRef(1)
  const nextSpawnRef = useRef(0)
  const renderAccumulatorRef = useRef(0)
  const lastGunStateRef = useRef(null)
  const ammoInMagRef = useRef(MAG_SIZE)
  const reserveAmmoRef = useRef(RESERVE_AMMO_START)
  const reloadEndsAtRef = useRef(-1)
  const reloadStartRef = useRef(-1)
  const [snapshot, setSnapshot] = useState({
    chickens: [],
    bullets: [],
    pops: [],
    impacts: [],
    playerHitPops: [],
    playerDeathPops: [],
  })
  const shootDir = useMemo(() => new THREE.Vector3(), [])
  const shootOrigin = useMemo(() => new THREE.Vector3(), [])
  const aimPoint = useMemo(() => new THREE.Vector3(), [])
  const cameraRayOrigin = useMemo(() => new THREE.Vector3(), [])
  const cameraRayDir = useMemo(() => new THREE.Vector3(), [])

  const notifyGunState = useCallback(
    (now) => {
      const isReloading = reloadEndsAtRef.current > now
      const reloadProgress = isReloading
        ? THREE.MathUtils.clamp(
            (now - reloadStartRef.current) / RELOAD_SECONDS,
            0,
            1,
          )
        : 0
      const next = {
        ammoInMag: ammoInMagRef.current,
        reserveAmmo: reserveAmmoRef.current,
        isReloading,
        reloadProgress,
      }
      const prev = lastGunStateRef.current
      const changed =
        !prev ||
        prev.ammoInMag !== next.ammoInMag ||
        prev.reserveAmmo !== next.reserveAmmo ||
        prev.isReloading !== next.isReloading ||
        Math.abs(prev.reloadProgress - next.reloadProgress) > 0.03
      if (changed) {
        lastGunStateRef.current = next
        onGunStateChange?.(next)
      }
    },
    [onGunStateChange],
  )

  const getWallCollision = useCallback((x, z, radius = CHICKEN_RADIUS) => {
    if (!collisionGrid) return null
    const { cellX, cellZ } = collisionGrid.worldToCell(x, z)
    const cs = collisionGrid.cellSize
    const extraCells = Math.ceil((radius + WALL_THICKNESS) / cs) + 2
    const r2 = radius * radius

    // Find nearest wall quad rectangle and return its outward normal.
    let best = null
    let bestDistSq = Infinity

    const tryRect = (xMin, xMax, zMin, zMax, centerX, centerZ) => {
      const closestX = clamp(x, xMin, xMax)
      const closestZ = clamp(z, zMin, zMax)
      const dx = x - closestX
      const dz = z - closestZ
      const distSq = dx * dx + dz * dz
      if (distSq >= r2) return
      if (distSq < bestDistSq) {
        bestDistSq = distSq
        if (distSq > 1e-10) {
          const dist = Math.sqrt(distSq)
          best = {
            nx: dx / dist,
            nz: dz / dist,
            push: radius - dist,
          }
        } else {
          // If we are exactly on the edge, fall back to vector from rect center.
          const vx = x - centerX
          const vz = z - centerZ
          const vLen = Math.hypot(vx, vz) || 1
          best = {
            nx: vx / vLen,
            nz: vz / vLen,
            push: radius * 0.5,
          }
        }
      }
    }

    for (let zz = cellZ - extraCells; zz <= cellZ + extraCells; zz += 1) {
      for (let xx = cellX - extraCells; xx <= cellX + extraCells; xx += 1) {
        if (collisionGrid.get(xx, zz) !== CELL_WALL) continue

        // East wall quad: floor at (xx-1, zz)
        if (collisionGrid.get(xx - 1, zz) === CELL_FLOOR) {
          const [wxFloor, wzFloor] = collisionGrid.cellToWorld(xx - 1, zz)
          const centerX = wxFloor + cs / 2
          const centerZ = wzFloor
          const xMin = centerX - WALL_THICKNESS / 2
          const xMax = centerX + WALL_THICKNESS / 2
          const zMin = centerZ - cs / 2
          const zMax = centerZ + cs / 2
          tryRect(xMin, xMax, zMin, zMax, centerX, centerZ)
        }

        // West wall quad: floor at (xx+1, zz)
        if (collisionGrid.get(xx + 1, zz) === CELL_FLOOR) {
          const [wxFloor, wzFloor] = collisionGrid.cellToWorld(xx + 1, zz)
          const centerX = wxFloor - cs / 2
          const centerZ = wzFloor
          const xMin = centerX - WALL_THICKNESS / 2
          const xMax = centerX + WALL_THICKNESS / 2
          const zMin = centerZ - cs / 2
          const zMax = centerZ + cs / 2
          tryRect(xMin, xMax, zMin, zMax, centerX, centerZ)
        }

        // North wall quad: floor at (xx, zz-1)
        if (collisionGrid.get(xx, zz - 1) === CELL_FLOOR) {
          const [wxFloor, wzFloor] = collisionGrid.cellToWorld(xx, zz - 1)
          const centerX = wxFloor
          const centerZ = wzFloor + cs / 2
          const xMin = centerX - cs / 2
          const xMax = centerX + cs / 2
          const zMin = centerZ - WALL_THICKNESS / 2
          const zMax = centerZ + WALL_THICKNESS / 2
          tryRect(xMin, xMax, zMin, zMax, centerX, centerZ)
        }

        // South wall quad: floor at (xx, zz+1)
        if (collisionGrid.get(xx, zz + 1) === CELL_FLOOR) {
          const [wxFloor, wzFloor] = collisionGrid.cellToWorld(xx, zz + 1)
          const centerX = wxFloor
          const centerZ = wzFloor - cs / 2
          const xMin = centerX - cs / 2
          const xMax = centerX + cs / 2
          const zMin = centerZ - WALL_THICKNESS / 2
          const zMax = centerZ + WALL_THICKNESS / 2
          tryRect(xMin, xMax, zMin, zMax, centerX, centerZ)
        }
      }
    }

    return best
  }, [collisionGrid])

  const rayMarchToWallHit = useCallback((rayOrigin, rayDir, maxDist = 200) => {
    if (!collisionGrid) return null

    const step = 0.09
    const testRadius = BULLET_RADIUS * 0.9

    const ox = rayOrigin.x
    const oy = rayOrigin.y
    const oz = rayOrigin.z

    const dx = rayDir.x
    const dy = rayDir.y
    const dz = rayDir.z

    let prevDist = 0

    for (let dist = 0; dist <= maxDist; dist += step) {
      const x = ox + dx * dist
      const z = oz + dz * dist
      const hit = getWallCollision(x, z, testRadius)

      // Quick y-range validation: walls occupy [floorThickness, floorThickness+wallHeight]
      if (hit) {
        const y = oy + dy * dist
        if (y >= FLOOR_THICKNESS - 0.05 && y <= FLOOR_THICKNESS + WALL_HEIGHT + 0.1) {
          // Refine distance to get a better triangulated hit point.
          let lo = prevDist
          let hi = dist
          for (let i = 0; i < 7; i += 1) {
            const mid = (lo + hi) / 2
            const mx = ox + dx * mid
            const mz = oz + dz * mid
            const mhit = getWallCollision(mx, mz, testRadius)
            if (mhit) hi = mid
            else lo = mid
          }
          const finalDist = hi
          const fx = ox + dx * finalDist
          const fy = oy + dy * finalDist
          const fz = oz + dz * finalDist
          return { dist: finalDist, point: new THREE.Vector3(fx, fy, fz) }
        }
      }

      prevDist = dist
    }

    return null
  }, [collisionGrid, getWallCollision])

  const rayToChickenHit = useCallback((rayOrigin, rayDir, maxDist = 200) => {
    let bestDist = Infinity
    let bestPoint = null
    const p0 = rayOrigin
    const p1 = rayOrigin.clone().addScaledVector(rayDir, maxDist)

    for (const c of chickensRef.current) {
      const t = segmentIntersectSphere(p0, p1, c.pos, CHICKEN_RADIUS)
      if (t == null) continue
      const dist = t * maxDist
      if (dist < bestDist) {
        bestDist = dist
        bestPoint = p0.clone().addScaledVector(rayDir, dist)
      }
    }

    if (!bestPoint) return null
    return { dist: bestDist, point: bestPoint }
  }, [])

  const rayToMuseumFloorHit = useCallback((rayOrigin, rayDir, maxDist = 200) => {
    if (!collisionGrid) return null
    if (Math.abs(rayDir.y) < 1e-6) return null

    const t = (FLOOR_THICKNESS - rayOrigin.y) / rayDir.y
    if (t <= 0 || t > maxDist) return null

    const point = rayOrigin.clone().addScaledVector(rayDir, t)
    const { cellX, cellZ } = collisionGrid.worldToCell(point.x, point.z)
    if (collisionGrid.get(cellX, cellZ) !== CELL_FLOOR) return null
    return { dist: t, point }
  }, [collisionGrid])

  useEffect(() => {
    const now = 0
    nextSpawnRef.current = now + 0.3
    chickensRef.current = [createChicken(nextIdRef.current++, now, collisionGrid)]
  }, [collisionGrid])

  useEffect(() => {
    for (const ev of hitEvents || []) {
      if (!ev?.key || seenHitEventKeysRef.current.has(ev.key)) continue
      seenHitEventKeysRef.current.add(ev.key)
      playerHitPopsRef.current.push(
        createPlayerHitBurst(
          nextIdRef.current++,
          new THREE.Vector3(ev.x, ev.y ?? 1, ev.z),
          nowRef.current,
        ),
      )
    }
  }, [hitEvents])

  useEffect(() => {
    for (const ev of deathEvents || []) {
      if (!ev?.key || seenDeathEventKeysRef.current.has(ev.key)) continue
      seenDeathEventKeysRef.current.add(ev.key)
      const victim = ev.id ? combatById?.[ev.id] : null
      const color = colorFromName(victim?.name)
      playerDeathPopsRef.current.push(
        createPlayerDeathBurst(
          nextIdRef.current++,
          new THREE.Vector3(ev.x, ev.y ?? 1, ev.z),
          nowRef.current,
          color,
        ),
      )
    }
  }, [combatById, deathEvents])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'KeyR') return
      if (!document.pointerLockElement) return
      const now = nowRef.current
      if (reloadEndsAtRef.current > now) return
      if (ammoInMagRef.current >= MAG_SIZE) return
      if (reserveAmmoRef.current <= 0) return
      reloadStartRef.current = now
      reloadEndsAtRef.current = now + RELOAD_SECONDS
      notifyGunState(now)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [notifyGunState])

  useEffect(() => {
    const onMouseDown = (event) => {
      if (event.button !== 0 || !document.pointerLockElement) return
      if (!localAlive) return
      const now = nowRef.current
      const isReloading = reloadEndsAtRef.current > now
      if (isReloading || ammoInMagRef.current <= 0) return
      ammoInMagRef.current -= 1
      notifyGunState(now)

      camera.getWorldPosition(cameraRayOrigin)
      camera.getWorldDirection(cameraRayDir).normalize()
      const cursorWallHit = rayMarchToWallHit(cameraRayOrigin, cameraRayDir)
      const cursorChickenHit = rayToChickenHit(cameraRayOrigin, cameraRayDir)
      const cursorFloorHit = rayToMuseumFloorHit(cameraRayOrigin, cameraRayDir)
      const cursorHit =
        [cursorWallHit, cursorChickenHit, cursorFloorHit]
          .filter(Boolean)
          .sort((a, b) => a.dist - b.dist)[0] || null
      if (cursorHit?.point) {
        aimPoint.copy(cursorHit.point)
      } else {
        aimPoint.copy(cameraRayOrigin).addScaledVector(cameraRayDir, 120)
      }

      if (muzzleRef?.current?.origin && muzzleRef?.current?.direction) {
        shootOrigin.copy(muzzleRef.current.origin)
        // Prevent low-aim shots from immediately colliding with floor near feet.
        shootOrigin.y = Math.max(shootOrigin.y, FLOOR_THICKNESS + BULLET_RADIUS + 0.06)
        shootDir.copy(aimPoint).sub(shootOrigin).normalize()
      } else {
        camera.getWorldPosition(shootOrigin)
        camera.getWorldDirection(shootDir).normalize()
      }

      const wallHit = rayMarchToWallHit(shootOrigin, shootDir)
      const floorHit = rayToMuseumFloorHit(shootOrigin, shootDir)
      const worldHit =
        [wallHit, floorHit]
          .filter(Boolean)
          .sort((a, b) => a.dist - b.dist)[0] || null

      bulletsRef.current.push({
        id: nextIdRef.current++,
        bornAt: nowRef.current,
        pos: shootOrigin.clone(),
        dir: shootDir.clone(),
        wallHitDist: worldHit?.dist ?? null,
        wallHitPoint: worldHit?.point ?? null,
      })
    }

    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [aimPoint, camera, cameraRayDir, cameraRayOrigin, localAlive, muzzleRef, notifyGunState, rayMarchToWallHit, rayToChickenHit, rayToMuseumFloorHit, shootDir, shootOrigin])

  useFrame((state, delta) => {
    const now = state.clock.elapsedTime
    nowRef.current = now
    if (reloadEndsAtRef.current > 0 && now >= reloadEndsAtRef.current) {
      const needed = MAG_SIZE - ammoInMagRef.current
      const load = Math.min(needed, reserveAmmoRef.current)
      ammoInMagRef.current += load
      reserveAmmoRef.current -= load
      reloadEndsAtRef.current = -1
      reloadStartRef.current = -1
    }
    notifyGunState(now)

    if (
      chickensRef.current.length < 22 &&
      now >= nextSpawnRef.current &&
      Math.random() > 0.18
    ) {
      chickensRef.current.push(createChicken(nextIdRef.current++, now, collisionGrid))
      nextSpawnRef.current =
        now + randomRange(SPAWN_BASE_SECONDS * 0.55, SPAWN_BASE_SECONDS * 1.2)
    }

    const worldHalf = collisionGrid
      ? (collisionGrid.width * collisionGrid.cellSize) / 2
      : WORLD_HALF

    const updatedChickens = []
    for (const chicken of chickensRef.current) {
      let activeChicken = chicken
      if (now >= activeChicken.turnTimer) {
        const currentSpeed = activeChicken.vel.length()
        const newAngle =
          Math.atan2(activeChicken.vel.z, activeChicken.vel.x) + randomRange(-0.95, 0.95)
        activeChicken = {
          ...activeChicken,
          vel: new THREE.Vector3(
            Math.cos(newAngle) * currentSpeed,
            0,
            Math.sin(newAngle) * currentSpeed,
          ),
          turnTimer: now + randomRange(0.7, 2.1),
        }
      }

      let nextVelX = activeChicken.vel.x
      let nextVelZ = activeChicken.vel.z
      let nextPosX = activeChicken.pos.x + nextVelX * delta
      let nextPosZ = activeChicken.pos.z + nextVelZ * delta
      if (nextPosX > worldHalf || nextPosX < -worldHalf) {
        nextVelX *= -1
        nextPosX = THREE.MathUtils.clamp(nextPosX, -worldHalf, worldHalf)
      }
      if (nextPosZ > worldHalf || nextPosZ < -worldHalf) {
        nextVelZ *= -1
        nextPosZ = THREE.MathUtils.clamp(nextPosZ, -worldHalf, worldHalf)
      }

      // Wall collision: if the next step would overlap a museum wall quad,
      // immediately steer velocity away from that wall.
      if (collisionGrid) {
        const hit = getWallCollision(nextPosX, nextPosZ, CHICKEN_RADIUS)
        if (hit) {
          const speed = Math.hypot(nextVelX, nextVelZ) || 1
          // Push out to avoid remaining inside the wall.
          nextPosX += hit.nx * (hit.push + 0.02)
          nextPosZ += hit.nz * (hit.push + 0.02)

          // Steer away immediately (opposite direction of the wall).
          nextVelX = hit.nx * speed
          nextVelZ = hit.nz * speed
        }
      }

      updatedChickens.push({
        ...activeChicken,
        pos: new THREE.Vector3(nextPosX, GROUND_Y, nextPosZ),
        vel: new THREE.Vector3(nextVelX, 0, nextVelZ),
      })
    }

    // Chicken-chicken collision (simple separation).
    for (let i = 0; i < updatedChickens.length; i += 1) {
      for (let j = i + 1; j < updatedChickens.length; j += 1) {
        const a = updatedChickens[i]
        const b = updatedChickens[j]
        const dx = a.pos.x - b.pos.x
        const dz = a.pos.z - b.pos.z
        const dist = Math.hypot(dx, dz)
        const minDist = (CHICKEN_RADIUS * 2) * 0.98
        if (dist < minDist && dist > 1e-6) {
          const nx = dx / dist
          const nz = dz / dist
          const penetration = minDist - dist
          const push = penetration / 2
          a.pos.x += nx * push
          a.pos.z += nz * push
          b.pos.x -= nx * push
          b.pos.z -= nz * push

          // Steer away immediately.
          const aSpeed = Math.hypot(a.vel.x, a.vel.z) || 1
          const bSpeed = Math.hypot(b.vel.x, b.vel.z) || 1
          a.vel.x = nx * aSpeed
          a.vel.z = nz * aSpeed
          b.vel.x = -nx * bSpeed
          b.vel.z = -nz * bSpeed
        }
      }
    }

    // Chicken-player collision: chickens run away from the local player.
    const playerPos = playerStateRef?.current
    if (playerPos) {
      const pcx = playerPos.x
      const pcz = playerPos.z
      for (const c of updatedChickens) {
        const dx = c.pos.x - pcx
        const dz = c.pos.z - pcz
        const dist = Math.hypot(dx, dz)
        const minDist = CHICKEN_RADIUS + PLAYER_RADIUS
        if (dist < minDist && dist > 1e-6) {
          const nx = dx / dist
          const nz = dz / dist
          const penetration = minDist - dist
          c.pos.x += nx * penetration
          c.pos.z += nz * penetration
          const speed = Math.hypot(c.vel.x, c.vel.z) || 1
          c.vel.x = nx * speed
          c.vel.z = nz * speed
        }
      }
    }

    chickensRef.current = updatedChickens

    const aliveChickens = [...chickensRef.current]
    const nextBullets = []
    for (const bullet of bulletsRef.current) {
      const age = now - bullet.bornAt
      if (age >= BULLET_LIFETIME) continue

      const segStart = bullet.pos
      const segEnd = bullet.pos
        .clone()
        .addScaledVector(bullet.dir, BULLET_SPEED * delta)

      const distPrev = BULLET_SPEED * age
      const distNext = BULLET_SPEED * (age + delta)

      const wallDist =
        bullet.wallHitDist == null ? Infinity : Number(bullet.wallHitDist)

      // Find earliest chicken hit along the bullet segment.
      let bestChickenIndex = -1
      let bestChickenDist = Infinity
      let bestPlayerId = null
      let bestPlayerDist = Infinity

      for (let i = 0; i < aliveChickens.length; i += 1) {
        const c = aliveChickens[i]
        const hitT = segmentIntersectSphere(
          segStart,
          segEnd,
          c.pos,
          CHICKEN_RADIUS + BULLET_RADIUS,
        )
        if (hitT == null) continue

        const distHit = distPrev + hitT * (distNext - distPrev)
        if (distHit < bestChickenDist) {
          bestChickenDist = distHit
          bestChickenIndex = i
        }
      }

      const remoteEntries = Object.entries(remotePlayers || {})
      for (let i = 0; i < remoteEntries.length; i += 1) {
        const [pid, p] = remoteEntries[i]
        if (!p || pid === localId) continue
        const combat = combatById?.[pid]
        if (combat?.alive === false) continue
        const center = new THREE.Vector3(p.x, (p.y ?? 1) + 0.45, p.z)
        const hitT = segmentIntersectSphere(segStart, segEnd, center, PLAYER_RADIUS + BULLET_RADIUS)
        if (hitT == null) continue
        const distHit = distPrev + hitT * (distNext - distPrev)
        if (distHit < bestPlayerDist) {
          bestPlayerDist = distHit
          bestPlayerId = pid
        }
      }

      // If wall is closer than chicken, resolve wall hit first.
      const nearestEntityDist = Math.min(bestChickenDist, bestPlayerDist)
      if (wallDist !== Infinity && nearestEntityDist !== Infinity && wallDist <= nearestEntityDist) {
        const impactPos =
          bullet.wallHitPoint ??
          segStart.clone().addScaledVector(bullet.dir, wallDist)
        impactsRef.current.push({
          id: nextIdRef.current++,
          bornAt: now,
          pos: impactPos.clone(),
        })
        continue
      }

      if (bestPlayerId && bestPlayerDist <= distNext) {
        reportPlayerHit?.(bestPlayerId)
        continue
      }

      // Chicken hit.
      if (bestChickenIndex >= 0 && bestChickenDist <= distNext) {
        const [hit] = aliveChickens.splice(bestChickenIndex, 1)
        popsRef.current.push(createPopBurst(nextIdRef.current++, hit.pos, nowRef.current))
        continue
      }

      // Wall hit (no chicken first).
      if (wallDist !== Infinity && wallDist <= distNext && wallDist >= distPrev) {
        const impactPos =
          bullet.wallHitPoint ??
          segStart.clone().addScaledVector(bullet.dir, wallDist)
        impactsRef.current.push({
          id: nextIdRef.current++,
          bornAt: now,
          pos: impactPos.clone(),
        })
        continue
      }

      nextBullets.push({ ...bullet, pos: segEnd })
    }
    chickensRef.current = aliveChickens
    bulletsRef.current = nextBullets

    popsRef.current = popsRef.current.filter((pop) => now - pop.bornAt < POP_LIFETIME)
    impactsRef.current = impactsRef.current.filter(
      (imp) => now - imp.bornAt < IMPACT_LIFETIME,
    )
    playerHitPopsRef.current = playerHitPopsRef.current.filter(
      (pop) => now - pop.bornAt < PLAYER_HIT_POP_LIFETIME,
    )
    playerDeathPopsRef.current = playerDeathPopsRef.current.filter(
      (pop) => now - pop.bornAt < PLAYER_DEATH_POP_LIFETIME,
    )

    renderAccumulatorRef.current += delta
    // Update the React render snapshot more frequently so chicken motion
    // doesn't look choppy.
    if (renderAccumulatorRef.current >= 1 / 30) {
      renderAccumulatorRef.current = 0
      setSnapshot({
        chickens: chickensRef.current.map((c) => ({
          id: c.id,
          x: c.pos.x,
          y: c.pos.y,
          z: c.pos.z,
          rotY: Math.atan2(c.vel.z, c.vel.x),
        })),
        bullets: bulletsRef.current.map((b) => ({
          id: b.id,
          x: b.pos.x,
          y: b.pos.y,
          z: b.pos.z,
        })),
        pops: popsRef.current.map((p) => ({
          id: p.id,
          x: p.pos.x,
          y: p.pos.y,
          z: p.pos.z,
          bornAt: p.bornAt,
          pieces: p.pieces,
        })),
        impacts: impactsRef.current.map((imp) => ({
          id: imp.id,
          x: imp.pos.x,
          y: imp.pos.y,
          z: imp.pos.z,
          bornAt: imp.bornAt,
        })),
        playerHitPops: playerHitPopsRef.current.map((p) => ({
          id: p.id,
          x: p.pos.x,
          y: p.pos.y,
          z: p.pos.z,
          bornAt: p.bornAt,
          pieces: p.pieces,
        })),
        playerDeathPops: playerDeathPopsRef.current.map((p) => ({
          id: p.id,
          x: p.pos.x,
          y: p.pos.y,
          z: p.pos.z,
          bornAt: p.bornAt,
          pieces: p.pieces,
          color: p.color,
        })),
      })
    }
  })

  return (
    <>
      {snapshot.chickens.map((c) => (
        <group key={c.id} position={[c.x, c.y, c.z]} rotation={[0, -c.rotY + Math.PI / 2, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[CHICKEN_RADIUS, 18, 18]} />
            <meshStandardMaterial color="#fff2dd" roughness={0.7} />
          </mesh>
          <mesh position={[0.18, 0.08, 0.23]} castShadow>
            <coneGeometry args={[0.09, 0.18, 12]} />
            <meshStandardMaterial color="#d87a4d" />
          </mesh>
        </group>
      ))}
      {snapshot.bullets.map((b) => (
        <mesh key={b.id} position={[b.x, b.y, b.z]} castShadow>
          <sphereGeometry args={[0.06, 10, 10]} />
          <meshStandardMaterial color="#f7d44a" emissive="#f2c203" emissiveIntensity={1.0} />
        </mesh>
      ))}
      {snapshot.impacts.map((imp) => (
        <ImpactMark key={imp.id} imp={imp} />
      ))}
      {snapshot.pops.map((pop) => (
        <ChickenPop key={pop.id} pop={pop} />
      ))}
      {snapshot.playerHitPops.map((pop) => (
        <PlayerHitPop key={pop.id} pop={pop} />
      ))}
      {snapshot.playerDeathPops.map((pop) => (
        <PlayerDeathPop key={pop.id} pop={pop} />
      ))}
    </>
  )
}

function ChickenPop({ pop }) {
  const refs = useRef([])

  useFrame((state) => {
    const age = state.clock.elapsedTime - pop.bornAt
    const gravity = -9.8
    for (let i = 0; i < pop.pieces.length; i += 1) {
      const mesh = refs.current[i]
      if (!mesh) continue
      const vel = pop.pieces[i].vel
      const radius = pop.pieces[i].radius
      mesh.position.set(
        pop.x + vel.x * age,
        pop.y + vel.y * age + 0.5 * gravity * age * age,
        pop.z + vel.z * age,
      )
      mesh.scale.setScalar(Math.max(0.01, radius * (1 - age / POP_LIFETIME)))
    }
  })

  return (
    <group>
      {pop.pieces.map((_, idx) => (
        <mesh key={idx} ref={(el) => (refs.current[idx] = el)} castShadow>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshStandardMaterial
            color={idx % 2 === 0 ? '#fff0db' : '#f0a57d'}
            emissive={idx % 2 === 0 ? '#ffd5a1' : '#ff8b57'}
            emissiveIntensity={0.5}
          />
        </mesh>
      ))}
    </group>
  )
}

function PlayerHitPop({ pop }) {
  const refs = useRef([])
  useFrame((state) => {
    const age = state.clock.elapsedTime - pop.bornAt
    const gravity = -9.8
    for (let i = 0; i < pop.pieces.length; i += 1) {
      const mesh = refs.current[i]
      if (!mesh) continue
      const vel = pop.pieces[i].vel
      const radius = pop.pieces[i].radius
      mesh.position.set(
        pop.x + vel.x * age,
        pop.y + vel.y * age + 0.5 * gravity * age * age,
        pop.z + vel.z * age,
      )
      mesh.scale.setScalar(Math.max(0.01, radius * (1 - age / PLAYER_HIT_POP_LIFETIME)))
    }
  })

  return (
    <group>
      {pop.pieces.map((_, idx) => (
        <mesh key={idx} ref={(el) => (refs.current[idx] = el)} castShadow={false}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial
            color="#a02222"
            emissive="#7a1111"
            emissiveIntensity={0.35}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  )
}

function PlayerDeathPop({ pop }) {
  const refs = useRef([])
  useFrame((state) => {
    const age = state.clock.elapsedTime - pop.bornAt
    const gravity = -9.8
    for (let i = 0; i < pop.pieces.length; i += 1) {
      const mesh = refs.current[i]
      if (!mesh) continue
      const vel = pop.pieces[i].vel
      const radius = pop.pieces[i].radius
      mesh.position.set(
        pop.x + vel.x * age,
        pop.y + vel.y * age + 0.5 * gravity * age * age,
        pop.z + vel.z * age,
      )
      mesh.scale.setScalar(Math.max(0.02, radius * (1 - age / PLAYER_DEATH_POP_LIFETIME)))
    }
  })

  return (
    <group>
      {pop.pieces.map((_, idx) => (
        <mesh key={idx} ref={(el) => (refs.current[idx] = el)} castShadow>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshStandardMaterial
            color={pop.color}
            emissive={pop.color}
            emissiveIntensity={0.62}
          />
        </mesh>
      ))}
    </group>
  )
}

function ImpactMark({ imp }) {
  const meshRef = useRef(null)

  useFrame((state) => {
    if (!meshRef.current) return
    const age = state.clock.elapsedTime - imp.bornAt
    const t = Math.max(0, Math.min(1, age / IMPACT_LIFETIME))
    const s = 1 + (1 - t) * 0.35
    meshRef.current.scale.setScalar(Math.max(0.01, s))
    if (meshRef.current.material) {
      meshRef.current.material.opacity = Math.max(0, 1 - t)
    }
  })

  return (
    <mesh ref={meshRef} position={[imp.x, imp.y, imp.z]} castShadow={false}>
      <sphereGeometry args={[IMPACT_RADIUS, 10, 10]} />
      <meshStandardMaterial
        color="#8a5a3c"
        emissive="#b07a4a"
        emissiveIntensity={0.65}
        transparent
        opacity={1}
        roughness={0.75}
      />
    </mesh>
  )
}

