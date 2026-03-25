import { useCallback, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Crosshair } from './gamemode/Crosshair.jsx'
import { CombatHud } from './gamemode/CombatHud.jsx'
import { MultiplayerHud } from './components/MultiplayerHud.jsx'
import { ScoreboardOverlay } from './components/ScoreboardOverlay.jsx'
import { GameScene } from './components/GameScene.jsx'
import { MuseumGate } from './screens/MuseumGate.jsx'
import { useGameInput } from './hooks/useGameInput.js'
import { useMultiplayer } from './hooks/useMultiplayer.js'
import { useCombatMode } from './gamemode/useCombatMode.js'
import { useCombatHudState } from './gamemode/useCombatHudState.js'

function MuseumSession({ displayName }) {
  const inputRef = useGameInput()
  const multiplayer = useMultiplayer(displayName)
  const remoteCount = Object.keys(multiplayer.remotePlayers).length
  const combatEnabled = useCombatMode()
  const combatHud = useCombatHudState()
  const lobbyPlayers = useMemo(() => {
    const rows = []
    const effectiveLocalId = multiplayer.localId ?? '__local__'
    const localCombat = multiplayer.localId
      ? multiplayer.combatById[multiplayer.localId] || {}
      : {}
    rows.push({
      id: effectiveLocalId,
      name: displayName,
      kills: localCombat.kills ?? 0,
      deaths: localCombat.deaths ?? 0,
    })
    Object.entries(multiplayer.remotePlayers).forEach(([id, p]) => {
      const combat = multiplayer.combatById[id] || {}
      rows.push({
        id,
        name: p?.name || 'Visitor',
        kills: combat.kills ?? p?.kills ?? 0,
        deaths: combat.deaths ?? p?.deaths ?? 0,
      })
    })
    return rows.sort((a, b) => a.name.localeCompare(b.name))
  }, [displayName, multiplayer.combatById, multiplayer.localId, multiplayer.remotePlayers])

  return (
    <>
      <MultiplayerHud
        status={multiplayer.status}
        remoteCount={remoteCount}
      />
      <ScoreboardOverlay players={lobbyPlayers} showCombatStats={combatEnabled} />
      {combatEnabled ? <ControlsHint /> : null}
      {combatEnabled ? (
        <>
          <Crosshair
            isReloading={combatHud.gunState.isReloading}
            reloadProgress={combatHud.gunState.reloadProgress}
            isOutOfAmmo={
              combatHud.gunState.ammoInMag <= 0
            }
          />
          <CombatHud
            healthRatio={combatHud.healthRatio}
            ammoInMag={combatHud.gunState.ammoInMag}
            reserveAmmo={combatHud.gunState.reserveAmmo}
          />
          <RespawnOverlay remaining={multiplayer.respawnRemaining} />
        </>
      ) : null}
      <Canvas shadows camera={{ position: [0, 2.5, 10], fov: 60 }}>
        <GameScene
          displayName={displayName}
          inputRef={inputRef}
          multiplayer={multiplayer}
          combatEnabled={combatEnabled}
          onGunStateChange={combatHud.onGunStateChange}
          gunState={combatHud.gunState}
          localId={multiplayer.localId}
          combatById={multiplayer.combatById}
          hitEvents={multiplayer.hitEvents}
          deathEvents={multiplayer.deathEvents}
          reportPlayerHit={multiplayer.reportPlayerHit}
          respawnToken={multiplayer.respawnToken}
        />
      </Canvas>
    </>
  )
}

function RespawnOverlay({ remaining }) {
  if (!remaining) return null
  const fade = Math.max(0, Math.min(1, remaining / 3))
  return (
    <div
      style={{
        position: 'fixed',
        top: '45%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 90,
        color: '#ffe9e2',
        fontSize: 30,
        fontWeight: 700,
        letterSpacing: 0.6,
        opacity: fade,
        textShadow: '0 4px 24px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
      }}
    >
      {`Respawn in ${remaining}...`}
    </div>
  )
}

function ControlsHint() {
  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        top: 110,
        zIndex: 50,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(36, 24, 24, 0.58)',
        border: '1px solid rgba(255,255,255,0.2)',
        color: '#fff7f2',
        fontSize: 13,
        lineHeight: 1.5,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div>F - dolphin dive</div>
      <div>C - crouch</div>
      <div>R - reload</div>
    </div>
  )
}

function App() {
  const [visitorName, setVisitorName] = useState(null)

  const handleEnter = useCallback((name) => {
    setVisitorName(name)
  }, [])

  if (!visitorName) {
    return <MuseumGate onEnter={handleEnter} />
  }

  return <MuseumSession displayName={visitorName} />
}

export default App
