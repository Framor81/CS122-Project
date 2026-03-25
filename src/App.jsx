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
    const remoteNames = Object.values(multiplayer.remotePlayers)
      .map((p) => p?.name || 'Visitor')
      .filter(Boolean)
    return [displayName, ...remoteNames].sort((a, b) => a.localeCompare(b))
  }, [displayName, multiplayer.remotePlayers])

  return (
    <>
      <MultiplayerHud
        status={multiplayer.status}
        remoteCount={remoteCount}
      />
      <ScoreboardOverlay players={lobbyPlayers} />
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
        />
      </Canvas>
    </>
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
