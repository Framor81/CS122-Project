import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useCapsuleColorFromName } from '../hooks/useCapsuleColorFromName.js'
import { CapsuleGun } from '../gamemode/CapsuleGun.jsx'
import { CELL_FLOOR, CELL_WALL } from '../world/grid/Grid.js'

const PLAYER_SPEED = 6
const JUMP_VELOCITY = 8.5

export function Player({
  displayName,
  inputRef,
  muzzleRef,
  combatEnabled,
  reloadProgress = 0,
  isReloading = false,
  collisionGrid,
  floorThickness = 0.12,
  wallThickness = 0.22,
  spawn,
  respawnToken = 0,
  worldGenToken = 0,
  isDead = false,
  remotePlayers = null,
  combatById = null,
  onTransform,
}) {
  const capsuleColor = useCapsuleColorFromName(displayName)
  const playerRef = useRef()
  const verticalVelocity = useRef(0)
  const cameraTarget = useRef(new THREE.Vector3())
  const moveDirection = useRef(new THREE.Vector3())
  const movedDir = useRef(new THREE.Vector3(0, 0, 1))
  const forward = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())
  const collisionNormal = useRef(new THREE.Vector2())
  const offsetVec = useRef(new THREE.Vector3())
  const lookDir = useRef(new THREE.Vector3())
  const lookTarget = useRef(new THREE.Vector3())
  const muzzleLocal = useRef(new THREE.Vector3(0.55, -0.1, 0.46))
  const muzzleWorld = useRef(new THREE.Vector3())
  const camForward = useRef(new THREE.Vector3())
  const particleLocalTmp = useRef(new THREE.Vector3())
  const dashLocalTmp = useRef(new THREE.Vector3())
  const dashDirLocalTmp = useRef(new THREE.Vector3())
  const { camera } = useThree()
  const playerRadius = 0.4
  const playerHalfHeightStand = 0.9
  const playerHalfHeightCrouch = 0.45
  const groundTopYStand = playerHalfHeightStand + floorThickness
  const groundTopYCrouch = playerHalfHeightCrouch + floorThickness

  // Combat-only locomotion state.
  const prevCrouchDownRef = useRef(false)
  const prevDiveDownRef = useRef(false)
  const diveUntilRef = useRef(-1)
  const diveCooldownUntilRef = useRef(-1)
  const diveTurnUntilRef = useRef(-1)
  const diveDirRef = useRef(new THREE.Vector3())

  const capsuleVisualGroupRef = useRef(null)

  const MAX_SPRINT_PARTICLES = 70
  const MAX_SPRINT_DASHES = 30
  const sprintParticleMeshesRef = useRef([])
  const sprintDashMeshesRef = useRef([])
  const sprintParticlesRef = useRef(
    Array.from({ length: MAX_SPRINT_PARTICLES }, () => ({
      alive: false,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      bornAt: 0,
      life: 0,
    })),
  )
  const sprintDashesRef = useRef(
    Array.from({ length: MAX_SPRINT_DASHES }, () => ({
      alive: false,
      pos: new THREE.Vector3(),
      startPos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      bornAt: 0,
      life: 0,
    })),
  )
  const sprintSpawnAccRef = useRef(0)

  const SPRINT_SPEED_MULT = 1.89
  const CROUCH_SPEED_MULT = 0.7
  const DIVE_SPEED_MULT = 2.8
  const DIVE_DURATION = 0.85
  const DIVE_COOLDOWN = 1.8
  const DIVE_UP_PHASE = 0.22
  // Camera collision is intentionally a bit conservative so it doesn't clip
  // into wall meshes when you're close.
  const cameraRadius = 0.18
  const cameraClearanceFromPlayer = 0.25
  const cameraDistFracRef = useRef(1)

  useEffect(() => {
    if (!playerRef.current || (!respawnToken && !worldGenToken)) return

    let nextX = spawn?.x ?? 0
    let nextZ = spawn?.z ?? 6

    // For respawn we pick a random valid floor tile.
    if (respawnToken && collisionGrid) {
      for (let i = 0; i < 260; i += 1) {
        const cx = Math.floor(Math.random() * collisionGrid.width)
        const cz = Math.floor(Math.random() * collisionGrid.height)
        if (collisionGrid.get(cx, cz) !== CELL_FLOOR) continue
        const [wx, wz] = collisionGrid.cellToWorld(cx, cz)
        nextX = wx
        nextZ = wz
        break
      }
    }
    playerRef.current.position.set(nextX, groundTopYStand, nextZ)
    verticalVelocity.current = 0
  }, [
    collisionGrid,
    groundTopYStand,
    respawnToken,
    worldGenToken,
    spawn?.x,
    spawn?.z,
  ])

  const isBlocked = (x, z, radius = playerRadius, extraCells = 2) => {
    if (!collisionGrid) return false
    const { cellX, cellZ } = collisionGrid.worldToCell(x, z)
    const cs = collisionGrid.cellSize
    const r2 = radius * radius

    const distToAABB2DSq = (px, pz, xMin, xMax, zMin, zMax) => {
      const dx = px < xMin ? xMin - px : px > xMax ? px - xMax : 0
      const dz = pz < zMin ? zMin - pz : pz > zMax ? pz - zMax : 0
      return dx * dx + dz * dz
    }

    const rCells = Math.ceil((radius + wallThickness) / cs) + extraCells

    for (let zz = cellZ - rCells; zz <= cellZ + rCells; zz += 1) {
      for (let xx = cellX - rCells; xx <= cellX + rCells; xx += 1) {
        if (collisionGrid.get(xx, zz) !== CELL_WALL) continue

        // Approximate `meshFromGrid` wall quads as 2D rectangles in XZ.
        // This matches how the walls are rendered: thin along thickness axis,
        // and spanning one cell along the orthogonal axis.

        // East wall (floor at xx-1; neighbor xx is not FLOOR)
        if (collisionGrid.get(xx - 1, zz) === CELL_FLOOR) {
          const [wxFloor, wzFloor] = collisionGrid.cellToWorld(xx - 1, zz)
          const centerX = wxFloor + cs / 2
          const centerZ = wzFloor
          const xMin = centerX - wallThickness / 2
          const xMax = centerX + wallThickness / 2
          const zMin = centerZ - cs / 2
          const zMax = centerZ + cs / 2
          if (distToAABB2DSq(x, z, xMin, xMax, zMin, zMax) < r2)
            return true
        }

        // West wall (floor at xx+1; neighbor xx is not FLOOR)
        if (collisionGrid.get(xx + 1, zz) === CELL_FLOOR) {
          const [wxFloor, wzFloor] = collisionGrid.cellToWorld(xx + 1, zz)
          const centerX = wxFloor - cs / 2
          const centerZ = wzFloor
          const xMin = centerX - wallThickness / 2
          const xMax = centerX + wallThickness / 2
          const zMin = centerZ - cs / 2
          const zMax = centerZ + cs / 2
          if (distToAABB2DSq(x, z, xMin, xMax, zMin, zMax) < r2)
            return true
        }

        // North wall (floor at zz-1; neighbor zz is not FLOOR)
        if (collisionGrid.get(xx, zz - 1) === CELL_FLOOR) {
          const [wxFloor, wzFloor] = collisionGrid.cellToWorld(xx, zz - 1)
          const centerX = wxFloor
          const centerZ = wzFloor + cs / 2
          const xMin = centerX - cs / 2
          const xMax = centerX + cs / 2
          const zMin = centerZ - wallThickness / 2
          const zMax = centerZ + wallThickness / 2
          if (distToAABB2DSq(x, z, xMin, xMax, zMin, zMax) < r2)
            return true
        }

        // South wall (floor at zz+1; neighbor zz is not FLOOR)
        if (collisionGrid.get(xx, zz + 1) === CELL_FLOOR) {
          const [wxFloor, wzFloor] = collisionGrid.cellToWorld(xx, zz + 1)
          const centerX = wxFloor
          const centerZ = wzFloor - cs / 2
          const xMin = centerX - cs / 2
          const xMax = centerX + cs / 2
          const zMin = centerZ - wallThickness / 2
          const zMax = centerZ + wallThickness / 2
          if (distToAABB2DSq(x, z, xMin, xMax, zMin, zMax) < r2)
            return true
        }
      }
    }

    return false
  }

  useFrame((state, delta) => {
    if (!playerRef.current) return
    const now = state.clock.elapsedTime
    const input = inputRef.current
    const player = playerRef.current
    const gravity = -20
    const cubeMinX = -1
    const cubeMaxX = 1
    const cubeMinY = 0
    const cubeMaxY = 2
    const cubeMinZ = -1
    const cubeMaxZ = 1

    forward.current.set(Math.sin(input.yaw), 0, Math.cos(input.yaw))
    right.current.set(-forward.current.z, 0, forward.current.x)

    moveDirection.current.set(0, 0, 0)
    if (!isDead) {
      if (input.forward) moveDirection.current.add(forward.current)
      if (input.backward) moveDirection.current.sub(forward.current)
      if (input.right) moveDirection.current.add(right.current)
      if (input.left) moveDirection.current.sub(right.current)
    }

    const diveActive = diveUntilRef.current > now
    const wantCrouch = !isDead && combatEnabled && input.crouch
    const wantSprint = !isDead && input.sprint
    const crouchJustPressed = wantCrouch && !prevCrouchDownRef.current
    const diveJustPressed = !isDead && combatEnabled && input.dive && !prevDiveDownRef.current

    // Grounded test for crouch drop should use standing height, otherwise
    // crouching immediately makes the "feet" math lie.
    const groundedStandNow =
      player.position.y - playerHalfHeightStand <= floorThickness + 0.08

    let effectiveHalfHeight = wantCrouch
      ? playerHalfHeightCrouch
      : playerHalfHeightStand
    let groundedNow =
      player.position.y - effectiveHalfHeight <= floorThickness + 0.06

    if (diveJustPressed && now >= diveCooldownUntilRef.current) {
      diveUntilRef.current = now + DIVE_DURATION
      diveCooldownUntilRef.current = now + DIVE_COOLDOWN
      const inAir = !groundedNow
      diveTurnUntilRef.current = inAir ? now : now + DIVE_UP_PHASE
      // Grounded: arc-jump first. Mid-air: redirect immediately without jump impulse.
      if (!inAir) verticalVelocity.current = JUMP_VELOCITY * 0.9
      if (moveDirection.current.lengthSq() > 1e-6) {
        diveDirRef.current.copy(moveDirection.current).normalize()
      } else {
        diveDirRef.current.copy(forward.current).normalize()
      }
    }

    const diveActiveNext = diveUntilRef.current > now
    effectiveHalfHeight = wantCrouch
      ? playerHalfHeightCrouch
      : playerHalfHeightStand
    groundedNow = player.position.y - effectiveHalfHeight <= floorThickness + 0.06

    // If we've just crouched while grounded, drop the capsule so the feet
    // stay on the floor.
    if (crouchJustPressed && groundedStandNow && !diveActive) {
      player.position.y = groundTopYCrouch
      verticalVelocity.current = 0
    }

    const cameraSeatOffset = effectiveHalfHeight === playerHalfHeightCrouch ? 0.42 : 0.62
    const isDiving = diveActiveNext
    const shouldDiveRotate = isDiving && now >= diveTurnUntilRef.current

    const wantsCrouchEffective = effectiveHalfHeight === playerHalfHeightCrouch
    const movingNow = moveDirection.current.lengthSq() > 1e-6

    // Sprint/dive speed selection.
    let speed = PLAYER_SPEED
    if (combatEnabled) {
      if (isDiving) speed *= DIVE_SPEED_MULT
      else if (wantsCrouchEffective) speed *= CROUCH_SPEED_MULT
    }
    if (!isDiving && wantSprint && !wantsCrouchEffective) {
      speed *= SPRINT_SPEED_MULT
    }

    const sprintVisualActive =
      wantSprint &&
      movingNow &&
      !wantsCrouchEffective &&
      !isDiving
    const diveDashActive = combatEnabled && isDiving
    const dashVisualActive = sprintVisualActive || diveDashActive

    const effectiveGroundTopY = effectiveHalfHeight + floorThickness

    const prevPosX = player.position.x
    const prevPosZ = player.position.z

    if (moveDirection.current.lengthSq() > 1e-6 || isDiving) {
      const dirVec = isDiving ? diveDirRef.current : moveDirection.current
      if (!isDiving) dirVec.normalize()

      const step = speed * delta
      const dx = dirVec.x * step
      const dz = dirVec.z * step

      let nextX = player.position.x + dx
      let nextZ = player.position.z + dz

      // Walls first (axis-wise like before).
      if (isBlocked(nextX, player.position.z)) nextX = player.position.x
      if (isBlocked(nextX, nextZ)) {
        // Try axis fallback before full revert.
        if (!isBlocked(player.position.x, nextZ)) nextX = player.position.x
        else nextZ = player.position.z
      }

      // Simple player collision against remote players.
      if (combatEnabled && !isDead && remotePlayers && combatById) {
        const minDist = playerRadius * 2 + 0.04
        for (const [rid, rp] of Object.entries(remotePlayers)) {
          const alive =
            combatById?.[rid]?.alive ??
            rp?.alive ??
            true
          if (!alive) continue
          const rx = rp?.x
          const rz = rp?.z
          if (typeof rx !== 'number' || typeof rz !== 'number') continue
          const ddx = nextX - rx
          const ddz = nextZ - rz
          const dist = Math.hypot(ddx, ddz)
          if (dist < 1e-6 || dist >= minDist) continue
          const nx = ddx / dist
          const nz = ddz / dist
          const push = (minDist - dist) + 0.01
          nextX += nx * push
          nextZ += nz * push

          // Don't let separation push you into walls.
          if (isBlocked(nextX, player.position.z)) nextX = player.position.x
          if (isBlocked(nextX, nextZ)) nextZ = player.position.z
        }
      }

      // Final wall gate.
      if (!isBlocked(nextX, nextZ)) {
        player.position.x = nextX
        player.position.z = nextZ
      }
    }

    const movedX = player.position.x - prevPosX
    const movedZ = player.position.z - prevPosZ
    if (movedX * movedX + movedZ * movedZ > 1e-8) {
      movedDir.current.set(movedX, 0, movedZ).normalize()
    }
    if (isDiving) {
      player.rotation.y = Math.atan2(diveDirRef.current.x, diveDirRef.current.z)
    } else {
      player.rotation.y = input.yaw
    }

    if (capsuleVisualGroupRef.current) {
      const crouchScaleY = wantsCrouchEffective && !isDiving ? 0.5 : 1
      capsuleVisualGroupRef.current.scale.set(1, crouchScaleY, 1)
      capsuleVisualGroupRef.current.rotation.set(
        shouldDiveRotate ? -Math.PI / 2 : 0,
        0,
        0,
      )
    }

    // Sprint particles (visual only).
    if (dashVisualActive) {
      const spawnRate = sprintVisualActive ? 55 : 28
      sprintSpawnAccRef.current += delta * spawnRate
      while (sprintSpawnAccRef.current >= 1) {
        sprintSpawnAccRef.current -= 1
        const runDir = movedDir.current
        const sideX = -runDir.z
        const sideZ = runDir.x
        const lateralJitter = (Math.random() - 0.5) * 0.42
        const backOffset = 0.36 + Math.random() * 0.22

        if (sprintVisualActive) {
          const ps = sprintParticlesRef.current
          let idx = -1
          for (let i = 0; i < ps.length; i += 1) {
            if (!ps[i].alive) {
              idx = i
              break
            }
          }
          if (idx >= 0) {
            const p = ps[idx]
            p.alive = true
            p.bornAt = now
            p.life = 0.75 + Math.random() * 0.35
            p.pos.set(
              player.position.x - runDir.x * backOffset + sideX * lateralJitter,
              player.position.y - 0.78,
              player.position.z - runDir.z * backOffset + sideZ * lateralJitter,
            )
            p.vel.set(
              runDir.x * (-2.7 - Math.random() * 2.0),
              2.1 + Math.random() * 1.9,
              runDir.z * (-2.7 - Math.random() * 2.0),
            )
          }
        }

        const ds = sprintDashesRef.current
        let dIdx = -1
        for (let i = 0; i < ds.length; i += 1) {
          if (!ds[i].alive) {
            dIdx = i
            break
          }
        }
        if (dIdx >= 0) {
          const d = ds[dIdx]
          d.alive = true
          d.bornAt = now
          d.life = 0.18 + Math.random() * 0.12
          const faceDir = movedDir.current.clone().normalize()
          const dashBack = 0.52 + Math.random() * 0.16
          const dashSide = (Math.random() - 0.5) * 0.1
          d.pos.set(
            player.position.x - faceDir.x * dashBack + sideX * dashSide,
            player.position.y - 0.62 + Math.random() * 0.04,
            player.position.z - faceDir.z * dashBack + sideZ * dashSide,
          )
          d.startPos.copy(d.pos)
          d.vel.set(
            faceDir.x * (-4.2 - Math.random() * 1.6),
            0.38 + Math.random() * 0.35,
            faceDir.z * (-4.2 - Math.random() * 1.6),
          )
        }
      }
    }

    const ps = sprintParticlesRef.current
    for (let i = 0; i < ps.length; i += 1) {
      const p = ps[i]
      const mesh = sprintParticleMeshesRef.current[i]
      if (!mesh) continue

      if (!p.alive) {
        mesh.scale.setScalar(0)
        continue
      }

      const age = now - p.bornAt
      if (age >= p.life) {
        p.alive = false
        mesh.scale.setScalar(0)
        continue
      }

      // Integrate simple projectile motion.
      p.vel.y += gravity * delta * 0.65
      p.pos.addScaledVector(p.vel, delta)

      particleLocalTmp.current.copy(p.pos)
      player.worldToLocal(particleLocalTmp.current)
      mesh.position.copy(particleLocalTmp.current)
      const remaining = 1 - age / p.life
      const s = Math.max(0.03, remaining * 1.6)
      mesh.scale.setScalar(s)
    }

    const ds = sprintDashesRef.current
    for (let i = 0; i < ds.length; i += 1) {
      const d = ds[i]
      const mesh = sprintDashMeshesRef.current[i]
      if (!mesh) continue
      if (!d.alive) {
        mesh.scale.set(0, 0, 0)
        continue
      }
      const age = now - d.bornAt
      if (age >= d.life) {
        d.alive = false
        mesh.scale.set(0, 0, 0)
        continue
      }
      d.vel.y += gravity * delta * 0.25
      d.pos.addScaledVector(d.vel, delta)
      dashLocalTmp.current.copy(d.pos)
      player.worldToLocal(dashLocalTmp.current)
      mesh.position.copy(dashLocalTmp.current)

      dashDirLocalTmp.current
        .copy(player.position)
        .add(movedDir.current)
      player.worldToLocal(dashDirLocalTmp.current)
      // Align with actual movement direction in local player space.
      mesh.rotation.y = Math.atan2(dashDirLocalTmp.current.x, dashDirLocalTmp.current.z)
      const rem = 1 - age / d.life
      const traveled = d.pos.distanceTo(d.startPos)
      const distFade = Math.max(0, 1 - traveled / 1.8)
      const fade = rem * distFade
      mesh.scale.set(
        Math.max(0.01, fade * 0.55),
        Math.max(0.005, fade * 0.12),
        Math.max(0.02, fade * 1.05),
      )
      if (mesh.material) {
        mesh.material.opacity = 0.75 * fade
        mesh.material.color.set('#ffffff')
        mesh.material.emissive.set('#ffffff')
        mesh.material.emissiveIntensity = 2.2
      }
    }

    const feetBeforeMove = player.position.y - effectiveHalfHeight
    const overCubeXZ =
      player.position.x > cubeMinX &&
      player.position.x < cubeMaxX &&
      player.position.z > cubeMinZ &&
      player.position.z < cubeMaxZ
    const grounded =
      feetBeforeMove <= floorThickness + 0.02 ||
      (overCubeXZ &&
        Math.abs(feetBeforeMove - cubeMaxY) < 0.1 &&
        verticalVelocity.current <= 0.15)

    if (input.jumpQueued) {
      if (grounded && !wantsCrouchEffective && !isDiving) {
        if (!isDead) verticalVelocity.current = JUMP_VELOCITY
      }
      input.jumpQueued = false
    }

    const previousY = player.position.y
    verticalVelocity.current += gravity * delta
    player.position.y += verticalVelocity.current * delta

    if (player.position.y < effectiveGroundTopY) {
      player.position.y = effectiveGroundTopY
      verticalVelocity.current = 0
    }

    const previousBottom = previousY - effectiveHalfHeight
    const currentBottom = player.position.y - effectiveHalfHeight
    const isOverCubeTop =
      player.position.x > cubeMinX &&
      player.position.x < cubeMaxX &&
      player.position.z > cubeMinZ &&
      player.position.z < cubeMaxZ

    if (
      isOverCubeTop &&
      verticalVelocity.current <= 0 &&
      previousBottom >= cubeMaxY &&
      currentBottom <= cubeMaxY
    ) {
      player.position.y = cubeMaxY + effectiveHalfHeight
      verticalVelocity.current = 0
    }

    const playerBottom = player.position.y - effectiveHalfHeight
    const playerTop = player.position.y + effectiveHalfHeight
    const intersectsCubeVertically =
      playerTop > cubeMinY && playerBottom < cubeMaxY

    if (intersectsCubeVertically && playerBottom < cubeMaxY - 0.02) {
      const closestX = Math.max(cubeMinX, Math.min(player.position.x, cubeMaxX))
      const closestZ = Math.max(cubeMinZ, Math.min(player.position.z, cubeMaxZ))
      const deltaX = player.position.x - closestX
      const deltaZ = player.position.z - closestZ
      const distanceSq = deltaX * deltaX + deltaZ * deltaZ

      if (distanceSq < playerRadius * playerRadius) {
        if (distanceSq > 1e-6) {
          const distance = Math.sqrt(distanceSq)
          const push = playerRadius - distance
          player.position.x += (deltaX / distance) * push
          player.position.z += (deltaZ / distance) * push
        } else {
          const toMinX = Math.abs(player.position.x - cubeMinX)
          const toMaxX = Math.abs(cubeMaxX - player.position.x)
          const toMinZ = Math.abs(player.position.z - cubeMinZ)
          const toMaxZ = Math.abs(cubeMaxZ - player.position.z)
          const minPenetration = Math.min(toMinX, toMaxX, toMinZ, toMaxZ)
          collisionNormal.current.set(0, 0)
          if (minPenetration === toMinX) collisionNormal.current.set(-1, 0)
          if (minPenetration === toMaxX) collisionNormal.current.set(1, 0)
          if (minPenetration === toMinZ) collisionNormal.current.set(0, -1)
          if (minPenetration === toMaxZ) collisionNormal.current.set(0, 1)
          player.position.x += collisionNormal.current.x * playerRadius
          player.position.z += collisionNormal.current.y * playerRadius
        }
      }
    }

    cameraTarget.current.copy(player.position)
    cameraTarget.current.y += cameraSeatOffset
    offsetVec.current.set(
      Math.sin(input.yaw + Math.PI) * 2.7,
      0.82,
      Math.cos(input.yaw + Math.PI) * 2.7,
    )

    // Camera-wall pushback (stable): pick the maximum allowed distance fraction
    // along the offset ray that does NOT intersect walls, then ease the distance
    // down quickly (shrink) and back up slowly (expand).
    const offsetLenXZ = Math.hypot(offsetVec.current.x, offsetVec.current.z)
    const maxSamples = 30

    let allowedT = 1
    if (offsetLenXZ < 1e-6) {
      allowedT = 0
    } else {
      // Find the farthest t such that the ray is continuously unblocked
      // from the player (t=0) outwards. This prevents "popping" through a
      // wall when only some ray points are misclassified.
      allowedT = 0
      for (let i = 0; i <= maxSamples; i += 1) {
        const t = i / maxSamples
        const camX = cameraTarget.current.x + offsetVec.current.x * t
        const camZ = cameraTarget.current.z + offsetVec.current.z * t

        const blocked = isBlocked(
          camX,
          camZ,
          cameraRadius + cameraClearanceFromPlayer,
          6,
        )
        if (blocked) {
          break
        }
        allowedT = t
      }
    }

    const curT = cameraDistFracRef.current
    // Shrink fast, expand slow so you stay in first-person against walls.
    const shrinkSpeed = 8
    const expandSpeed = 0.85
    let nextT = curT
    if (allowedT < curT) {
      nextT = Math.max(allowedT, curT - shrinkSpeed * delta)
    } else {
      nextT = Math.min(allowedT, curT + expandSpeed * delta)
    }
    cameraDistFracRef.current = nextT

    camera.position
      .copy(cameraTarget.current)
      .addScaledVector(offsetVec.current, nextT)

    lookDir.current.set(
      Math.sin(input.yaw) * Math.cos(input.pitch),
      -Math.sin(input.pitch),
      Math.cos(input.yaw) * Math.cos(input.pitch),
    )
    lookTarget.current.copy(camera.position).addScaledVector(lookDir.current, 8)
    camera.lookAt(lookTarget.current)

    if (muzzleRef?.current) {
      muzzleWorld.current.copy(muzzleLocal.current)
      player.localToWorld(muzzleWorld.current)
      camera.getWorldDirection(camForward.current).normalize()
      muzzleRef.current.origin = muzzleWorld.current.clone()
      muzzleRef.current.direction = camForward.current.clone()
    }

    // Update input edge-detection state.
    prevCrouchDownRef.current = wantCrouch
    prevDiveDownRef.current = combatEnabled && input.dive

    onTransform?.({
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: input.yaw,
    })
  })

  return (
    <group
      ref={playerRef}
      position={[spawn?.x ?? 0, groundTopYStand, spawn?.z ?? 6]}
    >
      <group ref={capsuleVisualGroupRef}>
        <mesh castShadow>
          <capsuleGeometry args={[0.4, 1.0, 8, 16]} />
          <meshStandardMaterial
            color={capsuleColor}
            roughness={0.48}
            metalness={0.04}
            emissive={capsuleColor}
            emissiveIntensity={0.09}
          />
        </mesh>
        <Text
          position={[0, 0.12, 0.41]}
          color="#3f2b2b"
          fontSize={0.14}
          anchorX="center"
          anchorY="middle"
        >
          :)
        </Text>
      </group>
      {Array.from({ length: MAX_SPRINT_PARTICLES }).map((_, i) => (
        <mesh
          key={`sprint-p-${i}`}
          ref={(el) => {
            sprintParticleMeshesRef.current[i] = el
          }}
          castShadow={false}
        >
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial
            color="#6a3215"
            emissive="#ff9a3b"
            emissiveIntensity={2.5}
            transparent
            opacity={1}
            roughness={0.16}
          />
        </mesh>
      ))}
      {Array.from({ length: MAX_SPRINT_DASHES }).map((_, i) => (
        <mesh
          key={`sprint-d-${i}`}
          ref={(el) => {
            sprintDashMeshesRef.current[i] = el
          }}
          castShadow={false}
        >
          <boxGeometry args={[0.04, 0.01, 0.22]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#ffffff"
            emissiveIntensity={3.0}
            transparent
            opacity={0.75}
            roughness={0.05}
          />
        </mesh>
      ))}
      {combatEnabled && !isDead ? (
        <CapsuleGun reloadProgress={reloadProgress} isReloading={isReloading} />
      ) : null}
    </group>
  )
}
