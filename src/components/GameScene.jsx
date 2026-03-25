import { ContactShadows, PointerLockControls, Text } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CombatLayer } from '../gamemode/CombatLayer.jsx'
import { Player } from './Player.jsx'
import { RemotePlayers } from './RemotePlayers.jsx'
import { MuseumLayout } from '../world/MuseumLayout.jsx'
import { generateMuseumGrid } from '../world/generateMuseumGrid.js'

// Pastel terracotta / playroom palette
const SKY = '#ffe5dc'
const FOG = '#f5d0c8'
const GRASS = '#c0dcc8'
const CUBE_TERRA = '#d88772'
const HEMI_SKY = '#fff5f0'
const HEMI_GROUND = '#c8e0c8'
const SUN_CORE = '#ffd56f'
const SUN_EDGE = '#e98e68'

function MovingSunLight() {
  const lightRef = useRef(null)
  const target = useMemo(() => new THREE.Object3D(), [])
  const { camera } = useThree()

  useFrame(() => {
    if (!lightRef.current) return

    const followX = camera.position.x
    const followZ = camera.position.z

    lightRef.current.position.set(followX + 14, 24, followZ + 10)
    target.position.set(followX, 0, followZ)
    lightRef.current.target = target
    lightRef.current.target.updateMatrixWorld()
  })

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={lightRef}
        castShadow
        intensity={1.05}
        color="#fff6ee"
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.00006}
        shadow-normalBias={0.03}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
      />
    </>
  )
}

export function GameScene({
  displayName,
  inputRef,
  multiplayer,
  combatEnabled,
  onGunStateChange,
  gunState,
}) {
  const { remotePlayers, localId, sendTransform } = multiplayer
  const showMuseumDebug = useMemo(() => {
    if (typeof window === 'undefined') return false
    return import.meta.env.DEV && new URLSearchParams(window.location.search).has('debugMuseum')
  }, [])
  const museumSeed = 'museum-seed-alpha'
  const museum = useMemo(() => generateMuseumGrid(museumSeed), [])
  const localPlayerStateRef = useRef({ x: 0, y: 0, z: 0, yaw: 0 })
  const handleLocalTransform = useCallback(
    (t) => {
      localPlayerStateRef.current = t
      sendTransform(t)
    },
    [sendTransform],
  )
  const worldSize = museum.grid.width * museum.grid.cellSize
  const groundSize = worldSize * 1.12
  const fogFar = Math.max(52, groundSize * 0.62)
  const contactScale = Math.min(200, groundSize)
  const contactFar = Math.min(180, groundSize * 0.6)
  const muzzleRef = useRef({
    origin: new THREE.Vector3(0, 1, 0),
    direction: new THREE.Vector3(0, 0, 1),
  })
  return (
    <>
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[FOG, 14, fogFar]} />

      <hemisphereLight args={[HEMI_SKY, HEMI_GROUND, 0.65]} />
      <ambientLight intensity={0.38} color="#ffece8" />
      <MovingSunLight />

      <mesh position={[34, 30, 24]}>
        <sphereGeometry args={[4.8, 32, 32]} />
        <meshBasicMaterial color={SUN_CORE} />
      </mesh>
      <mesh position={[34, 30, 24]}>
        <sphereGeometry args={[5.5, 32, 32]} />
        <meshBasicMaterial color={SUN_EDGE} transparent opacity={0.35} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial
          color={GRASS}
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>

      <mesh position={[0, 1, 0]} castShadow>
        <boxGeometry args={[2, 2, 2]} />
        <meshStandardMaterial
          color={CUBE_TERRA}
          roughness={0.55}
          metalness={0.06}
          emissive={CUBE_TERRA}
          emissiveIntensity={0.08}
        />
      </mesh>
      <MuseumLayout
        seed={museumSeed}
        grid={museum.grid}
        meta={museum.meta}
        debug={showMuseumDebug}
      />
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.4}
        scale={contactScale}
        blur={2.6}
        far={contactFar}
        color="#8f5e53"
      />

      <RemotePlayers players={remotePlayers} localId={localId} />
      {combatEnabled ? (
        <CombatLayer
          muzzleRef={muzzleRef}
          collisionGrid={museum.grid}
          playerStateRef={localPlayerStateRef}
          onGunStateChange={onGunStateChange}
        />
      ) : null}
      <Player
        displayName={displayName}
        inputRef={inputRef}
        muzzleRef={muzzleRef}
        combatEnabled={combatEnabled}
        reloadProgress={gunState?.reloadProgress ?? 0}
        isReloading={gunState?.isReloading ?? false}
        collisionGrid={museum.grid}
        floorThickness={museum?.meta?.floorThickness ?? 0.12}
        spawn={museum?.meta?.entrance?.spawnWorld}
        onTransform={handleLocalTransform}
      />

      <PointerLockControls selector="body" />
      <Text
        position={[0, 3.6, -2]}
        color="#8b4e46"
        fontSize={0.38}
        outlineWidth={0.04}
        outlineColor="#fff8f5"
        anchorX="center"
        anchorY="middle"
        maxWidth={4.5}
        textAlign="center"
      >
        {`Click to lock • WASD move • Space jump`}
      </Text>
    </>
  )
}
