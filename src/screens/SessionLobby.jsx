import { useMemo, useState } from 'react'
import { useMultiplayer } from '../hooks/useMultiplayer.js'
import { estimateMuseumArtworkCapacity } from '../world/galleryCapacity.js'
import { SessionChat } from '../components/SessionChat.jsx'
import { Museum3DShell } from '../components/Museum3DShell.jsx'

export function SessionLobby({
  displayName,
  userId,
  sessionCode,
  sessionArtworks,
  museumMap,
  museumMapLoading,
  chat,
  onEnterMuseum,
  onNavigate,
  onNavigate3D,
  onSignOut,
}) {
  const multiplayer = useMultiplayer(displayName, sessionCode)
  const [copied, setCopied] = useState(false)
  const [scopeSaving, setScopeSaving] = useState(false)
  const [scopeActionError, setScopeActionError] = useState('')

  const capacity = useMemo(() => {
    const m = museumMap
    if (!m?.seedText) return 0
    return estimateMuseumArtworkCapacity(m.seedText, m.gridSize)
  }, [museumMap])

  const poolCount = sessionArtworks.artworks?.length ?? 0
  const placedCount = capacity > 0 ? Math.min(poolCount, capacity) : 0
  const overflow = poolCount > capacity && capacity > 0
  const galleryLoading = sessionArtworks.loading || museumMapLoading

  const playerNames = useMemo(() => {
    const names = [displayName, ...Object.values(multiplayer.remotePlayers).map((p) => p?.name || 'Visitor')]
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
  }, [displayName, multiplayer.remotePlayers])

  const shareLink = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/${sessionCode}`
  }, [sessionCode])

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <Museum3DShell
        variant="lobby"
        displayName={displayName}
        activeRoute=""
        onNavigate={onNavigate}
        onNavigate3D={onNavigate3D}
        onSignOut={onSignOut}
      >
        <div className="m3d-lobby-wrap">
          <div className="m3d-lobby-grid">
            <section className="m3d-lobby-card m3d-lobby-card--main">
              <p className="m3d-lobby-eyebrow">Session lobby</p>
              <h1 className="m3d-lobby-title">Session Lobby</h1>
              <div className="m3d-lobby-rule" aria-hidden />
              <div className="m3d-session-code-row">
                <span className="m3d-session-code-label">Session code:</span>
                <span className="m3d-session-code">{sessionCode}</span>
                <button
                  type="button"
                  className="m3d-copy-btn"
                  aria-label="Copy session link"
                  onClick={copyLink}
                  title="Copy session link"
                >
                  {copied ? '✓' : '⧉'}
                </button>
              </div>

              <div className="m3d-gallery-panel">
                {sessionArtworks.isHost ? (
                  <label className="m3d-gallery-scope">
                    <span className="m3d-gallery-scope-label">Museum collection</span>
                    <select
                      className="m3d-gallery-select"
                      value={sessionArtworks.scope}
                      disabled={scopeSaving}
                      onChange={async (e) => {
                        const next = e.target.value
                        setScopeActionError('')
                        setScopeSaving(true)
                        try {
                          const result = await sessionArtworks.setScope(next)
                          if (result?.error) setScopeActionError(result.error)
                        } finally {
                          setScopeSaving(false)
                        }
                      }}
                    >
                      <option value="host">My uploads only</option>
                      <option value="all">Everyone’s uploads</option>
                    </select>
                    {scopeActionError ? (
                      <p className="m3d-gallery-scope-error" role="alert">
                        {scopeActionError}
                      </p>
                    ) : null}
                  </label>
                ) : (
                  <p className="m3d-gallery-guest-note">
                    {sessionArtworks.scope === 'all'
                      ? 'The host is including artwork from all accounts.'
                      : 'The host is using their own collection only.'}
                  </p>
                )}

                {galleryLoading ? (
                  <p className="m3d-gallery-summary m3d-gallery-summary--loading">Estimating the gallery…</p>
                ) : (
                  <div className="m3d-gallery-summary">
                    {capacity > 0 ? (
                      <p>
                        This map has room for up to <strong>{capacity}</strong> paintings on the walls.
                      </p>
                    ) : (
                      <p className="m3d-gallery-summary--warn">
                        Could not estimate wall capacity for this map.
                      </p>
                    )}
                    {capacity > 0 && poolCount > 0 ? (
                      <p>
                        <strong>{placedCount}</strong> {placedCount === 1 ? 'painting' : 'paintings'} will be
                        shown{overflow ? ', chosen at random' : ''} from <strong>{poolCount}</strong> in the
                        current pool
                        {overflow
                          ? ' (placement order mixes contributors so one person’s works are not all grouped together).'
                          : ', spread across the largest walls first.'}
                      </p>
                    ) : null}
                    {capacity > 0 && poolCount === 0 ? (
                      <p className="m3d-gallery-summary--warn">
                        No artwork in this pool yet — add uploads from the museum site, then return here.
                      </p>
                    ) : null}
                  </div>
                )}
              </div>

              <button type="button" className="m3d-enter-museum" onClick={onEnterMuseum}>
                Enter the museum →
              </button>
            </section>
            <section className="m3d-lobby-card">
              <div className="m3d-people-label">{`People in this server (${playerNames.length})`}</div>
              <div className="m3d-people-list">
                {playerNames.map((name, idx) => (
                  <div key={`${name}-${idx}`}>{name}</div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </Museum3DShell>
      <SessionChat chat={chat} top={132} width={340} maxHeight={360} />
    </>
  )
}
