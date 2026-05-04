import { PointerLockControls } from '@react-three/drei'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CombatLayer } from '../gamemode/CombatLayer.jsx'
import { PlaqueInspectBridge } from '../world/PlaqueInspectBridge.jsx'
import { PlaqueTargetsProvider } from '../world/PlaqueTargetsProvider.jsx'
import { Player } from './Player.jsx'
import { RemotePlayers } from './RemotePlayers.jsx'
import { MuseumLayout } from '../world/MuseumLayout.jsx'
import { SpawnFloorHint } from '../world/SpawnFloorHint.jsx'
import { generateMuseumGrid } from '../world/generateMuseumGrid.js'
import { meshFromGrid } from '../world/meshFromGrid.js'
import { estimatePlaceableArtworkCount } from '../world/generateFramePlacements.js'
import { prepareGalleryArtworks } from '../world/prepareGalleryArtworks.js'

const BG = '#121212'
/** Exterior ground — match interior floor read under fog. */
const GROUND = '#4a423d'

export function GameScene({
  displayName,
  inputRef,
  chatOpen = false,
  multiplayer,
  combatEnabled,
  onGunStateChange,
  gunState,
  localId,
  combatById,
  hitEvents,
  deathEvents,
  reportPlayerHit,
  respawnToken,
  museumMap,
  onRegenerateMap,
  canRegenerateMap = true,
  sessionCode = '',
  artworks = null,
  artworksLoading = false,
}) {
  const { remotePlayers, sendTransform } = multiplayer
  const showMuseumDebug = useMemo(() => {
    if (typeof window === 'undefined') return false
    return import.meta.env.DEV && new URLSearchParams(window.location.search).has('debugMuseum')
  }, [])
  const museumSeedText = museumMap?.seedText ?? 'museum-seed-alpha'
  const museumGridSize = museumMap?.gridSize ?? 800
  const museum = useMemo(
    () => generateMuseumGrid(museumSeedText, museumGridSize),
    [museumSeedText, museumGridSize],
  )

  const wallMeshParams = useMemo(
    () => ({
      floorThickness: 0.12,
      wallHeight: 7.8,
      wallThickness: 0.22,
    }),
    [],
  )

  const museumWalls = useMemo(() => {
    const { walls } = meshFromGrid(museum.grid, wallMeshParams)
    return walls
  }, [museum.grid, wallMeshParams])

  const preparedArtworks = useMemo(() => {
    if (!artworks || artworks.length === 0) return []
    const maxSlots = estimatePlaceableArtworkCount(museumWalls, wallMeshParams)
    const seed = `${sessionCode}|${museumSeedText}|${museumGridSize}`
    return prepareGalleryArtworks(artworks, maxSlots, seed)
  }, [
    artworks,
    museumGridSize,
    museumSeedText,
    museumWalls,
    sessionCode,
    wallMeshParams,
  ])

  // Press `P` to generate and publish a brand new shared map (host only — guests must not overwrite DB).
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code !== 'KeyP') return
      if (!canRegenerateMap) return
      onRegenerateMap?.()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canRegenerateMap, onRegenerateMap])
  const worldGenToken = `${museumSeedText}:${museumGridSize}`
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
  const muzzleRef = useRef({
    origin: new THREE.Vector3(0, 1, 0),
    direction: new THREE.Vector3(0, 0, 1),
  })
  const localCombat = localId ? combatById?.[localId] : null
  const localAlive = localCombat?.alive ?? true

  return (
    <>
      <color attach="background" args={[BG]} />
      {/* Combat: tight fog. Museum: wide + slightly lifted fog color so geometry isn't erased to pure black. */}
      <fog
        attach="fog"
        args={
          combatEnabled
            ? [BG, 5, 20]
            : ['#1a1a1a', 22, 118]
        }
      />

      {combatEnabled ? (
        <>
          <ambientLight intensity={0.15} />
          <directionalLight position={[0, 5, 5]} intensity={0.3} />
        </>
      ) : (
        <>
          <ambientLight intensity={0.66} color="#f2f0ed" />
          <hemisphereLight
            color="#5c5854"
            groundColor="#34302c"
            intensity={0.48}
          />
          <directionalLight
            position={[2, 12, 8]}
            intensity={0.72}
            color="#faf8f4"
          />
          <directionalLight
            position={[-8, 5, -6]}
            intensity={0.38}
            color="#d8d2ca"
          />
          <directionalLight
            position={[5, 2, -10]}
            intensity={0.22}
            color="#9c9690"
          />
        </>
      )}

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[groundSize, groundSize]} />
        <meshStandardMaterial color={GROUND} roughness={0.58} />
      </mesh>
      <PlaqueTargetsProvider>
        <MuseumLayout
          seed={museumSeedText}
          grid={museum.grid}
          meta={museum.meta}
          artworks={artworksLoading ? null : preparedArtworks}
          debug={showMuseumDebug}
        />
        <PlaqueInspectBridge chatOpen={chatOpen} combatEnabled={combatEnabled} />
      </PlaqueTargetsProvider>
      <SpawnFloorHint
        spawn={museum?.meta?.entrance?.spawnWorld}
        combatEnabled={combatEnabled}
        floorThickness={museum?.meta?.floorThickness ?? wallMeshParams.floorThickness}
      />
      <RemotePlayers players={remotePlayers} localId={localId} />
      {combatEnabled ? (
        <CombatLayer
          muzzleRef={muzzleRef}
          collisionGrid={museum.grid}
          playerStateRef={localPlayerStateRef}
          onGunStateChange={onGunStateChange}
          remotePlayers={remotePlayers}
          localId={localId}
          combatById={combatById}
          reportPlayerHit={reportPlayerHit}
          hitEvents={hitEvents}
          deathEvents={deathEvents}
          localAlive={localAlive}
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
        respawnToken={respawnToken}
        isDead={!localAlive}
        remotePlayers={remotePlayers}
        combatById={combatById}
        worldGenToken={worldGenToken}
        onTransform={handleLocalTransform}
      />

      <PointerLockControls selector="body" enabled={!chatOpen} />
    </>
  )
}
