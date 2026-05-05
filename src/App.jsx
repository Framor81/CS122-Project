import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { Crosshair } from './gamemode/Crosshair.jsx'
import { CombatHud } from './gamemode/CombatHud.jsx'
import { MultiplayerHud } from './components/MultiplayerHud.jsx'
import { ScoreboardOverlay } from './components/ScoreboardOverlay.jsx'
import { GameScene } from './components/GameScene.jsx'
import { SessionChat } from './components/SessionChat.jsx'
import { AuthGate } from './screens/AuthGate.jsx'
import { SessionGate } from './screens/SessionGate.jsx'
import { SessionLobby } from './screens/SessionLobby.jsx'
import { Museum3DLoading } from './components/Museum3DShell.jsx'
import { PlaqueInspectOverlay } from './components/PlaqueInspectOverlay.jsx'
import { MuseumTutorialOverlay } from './components/MuseumTutorialOverlay.jsx'
import { UsernameSetupGate } from './screens/UsernameSetupGate.tsx'
import { MuseumWebApp } from './screens/MuseumWebApp.tsx'
import { useGameInput } from './hooks/useGameInput.js'
import { useMultiplayer } from './hooks/useMultiplayer.js'
import { useCombatMode } from './gamemode/useCombatMode.js'
import { useCombatHudState } from './gamemode/useCombatHudState.js'
import { useSupabaseAuth } from './hooks/useSupabaseAuth.js'
import { useSessionChat } from './hooks/useSessionChat.js'
import { useSharedMuseumMap } from './hooks/useSharedMuseumMap.js'
import { useSessionArtworks } from './hooks/useSessionArtworks.js'
import { useArtworksReady } from './hooks/useArtworksReady.js'
import { applySessionFavoriteFilter } from './lib/sessionFavoriteFilter.js'

function sanitizeSessionCode(value) {
  if (typeof value !== 'string') return ''
  return value.trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)
}

const RESERVED_TOP_LEVEL_PATHS = new Set(['museum', '3d'])

function readSessionCodeFromUrl() {
  if (typeof window === 'undefined') return null
  const pathParts = window.location.pathname.split('/').filter(Boolean)
  if (pathParts[0] === 'session' && pathParts[1]) {
    const fromLegacyPath = sanitizeSessionCode(pathParts[1])
    if (fromLegacyPath) return fromLegacyPath
  }
  if (pathParts.length === 1 && !RESERVED_TOP_LEVEL_PATHS.has(pathParts[0])) {
    const fromPath = sanitizeSessionCode(pathParts[0])
    if (fromPath && fromPath.length >= 4) return fromPath
  }
  const qs = new URLSearchParams(window.location.search)
  const fromQuery = sanitizeSessionCode(qs.get('session') || '')
  return fromQuery || null
}

function SessionExperience({
  sessionCode,
  userId,
  displayName,
  hasEnteredMuseum,
  chat,
  onEnterMuseum,
  onExitMuseum,
  onHostSessionClosed,
  onNavigate,
  onNavigate3D,
  onSignOut,
}) {
  const [resolvedHostUserId, setResolvedHostUserId] = useState('')
  const autoFollowDisabledRef = useRef(false)
  const prevMuseumLiveRef = useRef(false)
  const sharedMuseum = useSharedMuseumMap(userId, sessionCode)
  const multiplayer = useMultiplayer(displayName, sessionCode, {
    userId,
    hostUserId: resolvedHostUserId,
    inMuseum: hasEnteredMuseum,
  })
  const sessionArtworks = useSessionArtworks({
    sessionCode,
    userId,
    connectedUserIds: multiplayer.connectedSessionUserIds,
    onHostUserIdResolved: setResolvedHostUserId,
  })

  useEffect(() => {
    autoFollowDisabledRef.current = false
    prevMuseumLiveRef.current = false
  }, [sessionCode])

  useEffect(() => {
    if (autoFollowDisabledRef.current) return
    if (hasEnteredMuseum) return
    const becameLive = multiplayer.museumSessionLive && !prevMuseumLiveRef.current
    prevMuseumLiveRef.current = multiplayer.museumSessionLive
    if (!becameLive) return
    onEnterMuseum?.()
  }, [hasEnteredMuseum, multiplayer.museumSessionLive, onEnterMuseum])

  const handleExitMuseum = useCallback(() => {
    autoFollowDisabledRef.current = true
    onExitMuseum?.()
  }, [onExitMuseum])

  if (sharedMuseum.loading) {
    return <Museum3DLoading />
  }

  if (!hasEnteredMuseum) {
    return (
      <SessionLobby
        displayName={displayName}
        userId={userId}
        sessionCode={sessionCode}
        sessionArtworks={sessionArtworks}
        museumMap={sharedMuseum.museumMap}
        museumMapLoading={sharedMuseum.loading}
        chat={chat}
        multiplayer={multiplayer}
        onEnterMuseum={onEnterMuseum}
        onNavigate={onNavigate}
        onNavigate3D={onNavigate3D}
        onSignOut={onSignOut}
      />
    )
  }

  return (
    <MuseumSession
      displayName={displayName}
      sessionCode={sessionCode}
      sessionArtworks={sessionArtworks}
      chat={chat}
      museumMap={sharedMuseum.museumMap}
      multiplayer={multiplayer}
      onRegenerateMap={sharedMuseum.regenerateMap}
      onExitMuseum={handleExitMuseum}
      onHostSessionClosed={onHostSessionClosed}
    />
  )
}

function MuseumSession({
  displayName,
  sessionCode,
  chat,
  museumMap,
  onRegenerateMap,
  onExitMuseum,
  onHostSessionClosed,
  sessionArtworks,
  multiplayer,
}) {
  const [chatOpen, setChatOpen] = useState(false)
  const inputRef = useGameInput({ disabled: chatOpen })
  const artworksForGallery = useMemo(
    () =>
      applySessionFavoriteFilter(sessionArtworks.artworks, multiplayer.favoritesPicksByUser),
    [multiplayer.favoritesPicksByUser, sessionArtworks.artworks],
  )
  const artworkUrls = useMemo(
    () =>
      (artworksForGallery || [])
        .map((a) => a?.imageUrl)
        .filter(Boolean),
    [artworksForGallery],
  )
  const artworkReadiness = useArtworksReady(artworkUrls, {
    enabled: !sessionArtworks.loading,
  })
  const museumReady = !sessionArtworks.loading && artworkReadiness.ready
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
      <div className="pointer-events-none fixed inset-0 z-[55]">
        <div className="absolute top-6 left-8 text-xs font-normal tracking-[0.35em] text-neutral-400">
          MUSEUM
          <div className="mt-1 text-[10px] tracking-[0.28em] text-neutral-500">
            Session {sessionCode}
          </div>
        </div>
        <div className="absolute top-6 right-8 text-right text-[11px] font-normal tracking-[0.16em] text-neutral-500">
          <div>Press Enter to Chat</div>
          <div className="mt-1 text-[10px] tracking-wide text-neutral-600">
            Guest: {displayName}
          </div>
        </div>
        <button
          type="button"
          onClick={onExitMuseum}
          className="pointer-events-auto absolute bottom-8 left-8 cursor-pointer border-0 bg-transparent p-0 text-left text-xs font-normal tracking-[0.28em] text-neutral-400 hover:text-neutral-300"
        >
          ← Exit Museum
        </button>
      </div>
      <MultiplayerHud
        status={multiplayer.status}
        remoteCount={remoteCount}
      />
      <ScoreboardOverlay players={lobbyPlayers} showCombatStats={combatEnabled} />
      <SessionChat
        chat={chat}
        top={88}
        width={360}
        maxHeight={360}
        onOpenChange={setChatOpen}
        showEnterHint={false}
      />
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
      <MuseumLoadingOverlay
        visible={!museumReady}
        loaded={artworkReadiness.loaded}
        total={artworkReadiness.total}
        artworksLoading={sessionArtworks.loading}
      />
      {museumReady && !combatEnabled ? <MuseumTutorialOverlay key={sessionCode} sessionCode={sessionCode} /> : null}
      {!combatEnabled ? <PlaqueInspectOverlay /> : null}
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        camera={{ position: [0, 2.5, 10], fov: 60 }}
        style={{ position: 'fixed', inset: 0, zIndex: 0 }}
      >
        <GameScene
          displayName={displayName}
          inputRef={inputRef}
          chatOpen={chatOpen}
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
          canRegenerateMap={sessionArtworks.isHost}
          sessionCode={sessionCode}
          artworks={artworksForGallery}
          artworksLoading={sessionArtworks.loading}
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
        top: 124,
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

function MuseumLoadingOverlay({ visible, loaded, total, artworksLoading }) {
  if (!visible) return null
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0
  const label = artworksLoading
    ? 'Fetching session collection…'
    : total === 0
      ? 'Preparing the gallery…'
      : `Loading paintings… ${loaded}/${total}`
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background:
          'radial-gradient(circle at 50% 40%, #1d1410 0%, #0a0606 70%)',
        color: '#ffe9d9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 18,
        fontFamily: '"Playfair Display", serif',
      }}
    >
      <div style={{ fontSize: 32, letterSpacing: 1, fontWeight: 600 }}>
        Entering the museum
      </div>
      <div
        style={{
          width: 320,
          height: 6,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.10)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background:
              'linear-gradient(90deg, #d4a574 0%, #f7e3c9 50%, #d4a574 100%)',
            transition: 'width 200ms ease',
          }}
        />
      </div>
      <div style={{ fontSize: 13, opacity: 0.75, fontFamily: 'Inter, sans-serif' }}>
        {label}
      </div>
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

function App() {
  const auth = useSupabaseAuth()
  const [visitorName, setVisitorName] = useState('')
  const [pathname, setPathname] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname : '/',
  )
  const [sessionCode, setSessionCode] = useState(() => readSessionCodeFromUrl())
  const [hasEnteredMuseum, setHasEnteredMuseum] = useState(false)

  const handleEnterMuseum = useCallback(() => {
    setHasEnteredMuseum(true)
  }, [])

  const effectiveDisplayName =
    visitorName ||
    auth.user?.user_metadata?.username ||
    auth.user?.email?.split('@')[0] ||
    'Visitor'
  const sessionChat = useSessionChat({
    sessionCode: sessionCode || '',
    userId: auth.user?.id || '',
    displayName: effectiveDisplayName,
  })
  const handleExitMuseum = useCallback(() => {
    setHasEnteredMuseum(false)
  }, [])
  const handleSignOut = useCallback(async () => {
    setVisitorName('')
    setSessionCode(null)
    setHasEnteredMuseum(false)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/')
      setPathname('/')
    }
    await auth.signOut()
  }, [auth])
  const handleNavigate3D = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/3d')
      setPathname('/3d')
      setSessionCode(null)
      setHasEnteredMuseum(false)
    }
  }, [])
  const handleReturnHome = useCallback(() => {
    setSessionCode(null)
    setHasEnteredMuseum(false)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/')
      setPathname('/')
    }
  }, [])
  const handleNavbarNavigate = useCallback(
    (path) => {
      if (path === '/home') {
        handleReturnHome()
        return
      }
      const url =
        path === '/collection' ? '/museum/collection' : '/museum/add-artwork'
      if (typeof window !== 'undefined') {
        window.history.pushState({}, '', url)
        setPathname(url)
      }
    },
    [handleReturnHome],
  )
  const handleSessionSelect = useCallback((code) => {
    const normalized = sanitizeSessionCode(code)
    setSessionCode(normalized || null)
    setHasEnteredMuseum(false)
    if (typeof window !== 'undefined' && normalized) {
      window.history.pushState({}, '', `/${normalized}`)
      setPathname(`/${normalized}`)
    }
  }, [])

  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname === '/museum/home') {
        window.history.replaceState({}, '', '/')
      }
      setPathname(window.location.pathname)
      const code = readSessionCodeFromUrl()
      setSessionCode(code)
      setHasEnteredMuseum(false)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  if (auth.loading) {
    return <Museum3DLoading />
  }

  if (pathname === '/museum/home') {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', '/')
      setPathname('/')
    }
    return null
  }

  if (pathname === '/' || pathname.startsWith('/museum')) {
    if (auth.user && auth.userNeedsUsername) {
      return (
        <UsernameSetupGate
          error={auth.error}
          onSave={async (username) => {
            const result = await auth.updateUsername(username)
            if (!result.error) setVisitorName(username.trim())
            return result
          }}
        />
      )
    }
    return (
      <MuseumWebApp
        auth={auth}
        displayName={effectiveDisplayName}
        onSignedInName={(username) => setVisitorName(username)}
        onNavigate3D={handleNavigate3D}
      />
    )
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

  if (auth.userNeedsUsername) {
    return (
      <UsernameSetupGate
        error={auth.error}
        onSave={async (username) => {
          const result = await auth.updateUsername(username)
          if (!result.error) setVisitorName(username.trim())
          return result
        }}
      />
    )
  }

  if (!sessionCode) {
    return (
      <SessionGate
        onSelectSession={handleSessionSelect}
        userId={auth.user.id}
        displayName={effectiveDisplayName}
        onNavigate={handleNavbarNavigate}
        onNavigate3D={handleNavigate3D}
        onSignOut={handleSignOut}
      />
    )
  }

  return (
    <SessionExperience
      sessionCode={sessionCode}
      userId={auth.user.id}
      displayName={effectiveDisplayName}
      hasEnteredMuseum={hasEnteredMuseum}
      chat={sessionChat}
      onEnterMuseum={handleEnterMuseum}
      onExitMuseum={handleExitMuseum}
      onHostSessionClosed={() => {
        setHasEnteredMuseum(false)
        setSessionCode(null)
        if (typeof window !== 'undefined') {
          window.history.pushState({}, '', '/')
          setPathname('/')
        }
      }}
      onNavigate={handleNavbarNavigate}
      onNavigate3D={handleNavigate3D}
      onSignOut={handleSignOut}
    />
  )
}

export default App
