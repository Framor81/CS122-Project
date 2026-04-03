import { useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Crosshair } from './gamemode/Crosshair.jsx'
import { CombatHud } from './gamemode/CombatHud.jsx'
import { MultiplayerHud } from './components/MultiplayerHud.jsx'
import { ScoreboardOverlay } from './components/ScoreboardOverlay.jsx'
import { GameScene } from './components/GameScene.jsx'
import { AuthGate } from './screens/AuthGate.jsx'
import { SessionGate } from './screens/SessionGate.jsx'
import { SessionLobby } from './screens/SessionLobby.jsx'
import { useGameInput } from './hooks/useGameInput.js'
import { useMultiplayer } from './hooks/useMultiplayer.js'
import { useCombatMode } from './gamemode/useCombatMode.js'
import { useCombatHudState } from './gamemode/useCombatHudState.js'
import { useSupabaseAuth } from './hooks/useSupabaseAuth.js'
import { useSharedMuseumMap } from './hooks/useSharedMuseumMap.js'
import { capsuleColorFromName } from './hooks/useCapsuleColorFromName.js'

function sanitizeSessionCode(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
}

function readSessionCodeFromUrl() {
  if (typeof window === 'undefined') return null
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  if (pathParts[0] === 'session' && pathParts[1]) {
    const fromPath = sanitizeSessionCode(pathParts[1])
    if (fromPath) return fromPath
  }
  const qs = new URLSearchParams(window.location.search)
  const fromQuery = sanitizeSessionCode(qs.get('session') || '')
  return fromQuery || null
}

function MuseumSession({
  displayName,
  sessionCode,
  museumMap,
  onRegenerateMap,
  onExitMuseum,
  onHostSessionClosed,
}) {
  const inputRef = useGameInput()
  const multiplayer = useMultiplayer(displayName, sessionCode)
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
  useEffect(() => {
    if (!multiplayer.sessionCloseRemaining) return
    const timeout = window.setTimeout(() => {
      onHostSessionClosed?.()
    }, multiplayer.sessionCloseRemaining * 1000 + 60)
    return () => window.clearTimeout(timeout)
  }, [multiplayer.sessionCloseRemaining, onHostSessionClosed])

  return (
    <>
      <MultiplayerHud
        status={multiplayer.status}
        remoteCount={remoteCount}
      />
      <div
        style={{
          position: 'fixed',
          left: 16,
          top: 56,
          zIndex: 70,
          padding: '7px 10px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.25)',
          background: 'rgba(30,20,20,0.45)',
          color: '#fff7f2',
          fontSize: 12,
        }}
      >
        Session: {sessionCode}
      </div>
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
      <SessionClosingOverlay remaining={multiplayer.sessionCloseRemaining} />
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
          museumMap={museumMap}
          onRegenerateMap={onRegenerateMap}
        />
      </Canvas>
      <button
        type="button"
        onClick={onExitMuseum}
        style={{
          position: 'fixed',
          left: 16,
          top: 16,
          zIndex: 70,
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.35)',
          background: 'rgba(30,20,20,0.55)',
          color: '#fff7f2',
          cursor: 'pointer',
        }}
      >
        Exit museum
      </button>
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

function SessionClosingOverlay({ remaining }) {
  if (!remaining) return null
  return (
    <div
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 95,
        color: '#ffe9e2',
        fontSize: 28,
        fontWeight: 700,
        letterSpacing: 0.6,
        textAlign: 'center',
        textShadow: '0 4px 24px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
      }}
    >
      <div>The host has left the museum.</div>
      <div>{`Returning to lobby in ${remaining}...`}</div>
    </div>
  )
}

function AccountTopBar({ displayName, onSignOut }) {
  const capsuleColor = capsuleColorFromName(displayName || 'Visitor')
  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        top: 16,
        zIndex: 120,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <button
        type="button"
        onClick={onSignOut}
        style={{
          padding: '8px 10px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.35)',
          background: 'rgba(30,20,20,0.55)',
          color: '#fff7f2',
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
      <button
        type="button"
        title={displayName || 'Visitor'}
        aria-label="Profile"
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          border: '2px solid rgba(255,255,255,0.5)',
          background: 'rgba(30,20,20,0.55)',
          display: 'grid',
          placeItems: 'center',
          cursor: 'default',
          padding: 0,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            overflow: 'hidden',
            position: 'relative',
            background: 'rgba(255,255,255,0.16)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 6,
              top: 2,
              width: 18,
              height: 28,
              borderRadius: 999,
              background: capsuleColor,
              border: '1px solid rgba(20,20,20,0.35)',
              boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.16)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 11,
              top: 10,
              width: 2,
              height: 2,
              borderRadius: 999,
              background: '#2b1d1a',
              boxShadow: '6px 0 0 #2b1d1a',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: 12,
              top: 14,
              width: 6,
              height: 3,
              border: '1px solid #2b1d1a',
              borderTop: 'none',
              borderRadius: '0 0 8px 8px',
            }}
          />
        </span>
      </button>
    </div>
  )
}

function App() {
  const auth = useSupabaseAuth()
  const [visitorName, setVisitorName] = useState('')
  const [sessionCode, setSessionCode] = useState(() => readSessionCodeFromUrl())
  const [hasEnteredMuseum, setHasEnteredMuseum] = useState(false)
  const sharedMuseum = useSharedMuseumMap(auth.user?.id, sessionCode)

  const handleEnterMuseum = useCallback(() => {
    setHasEnteredMuseum(true)
  }, [])

  const effectiveDisplayName =
    visitorName ||
    auth.user?.user_metadata?.username ||
    auth.user?.email?.split('@')[0] ||
    'Visitor'
  const handleExitMuseum = useCallback(() => {
    setHasEnteredMuseum(false)
  }, [])
  const handleSignOut = useCallback(async () => {
    setVisitorName('')
    setSessionCode(null)
    setHasEnteredMuseum(false)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/')
    }
    await auth.signOut()
  }, [auth])
  const handleSessionSelect = useCallback((code) => {
    const normalized = sanitizeSessionCode(code)
    setSessionCode(normalized || null)
    setHasEnteredMuseum(false)
    if (typeof window !== 'undefined' && normalized) {
      window.history.pushState({}, '', `/session/${normalized}`)
    }
  }, [])

  useEffect(() => {
    const onPop = () => {
      const code = readSessionCodeFromUrl()
      setSessionCode(code)
      setHasEnteredMuseum(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (auth.loading || (sessionCode && sharedMuseum.loading)) {
    return <div className="museum-gate">Loading...</div>
  }

  if (!auth.user) {
    return (
      <AuthGate
        hasConfig={auth.hasSupabaseConfig}
        error={auth.error}
        onSignIn={async (email, password, username) => {
          const result = await auth.signIn(email, password, username)
          if (!result.error) setVisitorName(username.trim())
          return result
        }}
        onSignUp={async (email, password, username) => {
          const result = await auth.signUp(email, password, username)
          if (!result.error) setVisitorName(username.trim())
          return result
        }}
      />
    )
  }

  if (!sessionCode) {
    return (
      <>
        <AccountTopBar displayName={effectiveDisplayName} onSignOut={handleSignOut} />
        <SessionGate onSelectSession={handleSessionSelect} userId={auth.user.id} />
      </>
    )
  }

  if (!hasEnteredMuseum) {
    return (
      <>
        <AccountTopBar displayName={effectiveDisplayName} onSignOut={handleSignOut} />
        <SessionLobby
          displayName={effectiveDisplayName}
          sessionCode={sessionCode}
          onEnterMuseum={handleEnterMuseum}
        />
      </>
    )
  }

  return (
    <>
      <AccountTopBar displayName={effectiveDisplayName} onSignOut={handleSignOut} />
      <MuseumSession
        displayName={effectiveDisplayName}
        sessionCode={sessionCode}
        museumMap={sharedMuseum.museumMap}
        onRegenerateMap={sharedMuseum.regenerateMap}
        onExitMuseum={handleExitMuseum}
        onHostSessionClosed={() => {
          setHasEnteredMuseum(false)
          setSessionCode(null)
          if (typeof window !== 'undefined') {
            window.history.pushState({}, '', '/')
          }
        }}
      />
    </>
  )
}

export default App
