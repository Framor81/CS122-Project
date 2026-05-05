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

const BG = '#2a2826'
/** Exterior ground plane — slightly lighter than before for consistency with brighter interior. */
const GROUND = '#5c534a'

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
      {/* Museum: no fog (minimal perf win; clearer distance). Combat keeps fog for readability. */}
      {combatEnabled ? (
        <fog attach="fog" args={[BG, 5, 20]} />
      ) : null}

      {combatEnabled ? (
        <>
          <ambientLight intensity={0.15} />
          <directionalLight position={[0, 5, 5]} intensity={0.3} />
        </>
      ) : (
        <>
          {/* Bright, even fill — no per-painting spots (see GalleryPainting). */}
          <ambientLight intensity={1.05} color="#faf8f5" />
          <hemisphereLight
            color="#ddd9d4"
            groundColor="#6f6a64"
            intensity={0.75}
          />
          <directionalLight
            position={[2, 14, 8]}
            intensity={1.2}
            color="#fffbf5"
          />
          <directionalLight
            position={[-6, 6, -4]}
            intensity={0.35}
            color="#e8e4de"
          />
        </>
      )}

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
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
