import metHeroBgUrl from '../../resources/met.jpg?url'
import { MuseumNavbar } from './MuseumNavbar.jsx'
import '../screens/Museum3DExperience.css'

/**
 * Shared chrome for /3d and session lobby: dark backdrop + same nav as main museum site.
 */
export function Museum3DShell({
  variant = 'hero',
  displayName = 'Guest',
  activeRoute = '',
  onNavigate,
  onSignOut,
  onNavigate3D,
  children,
}) {
  const shellClass = `museum-3d-shell museum-3d-shell--${variant === 'lobby' ? 'lobby' : 'hero'}`

  return (
    <div className={shellClass}>
      <div
        className="museum-3d-shell__bg"
        aria-hidden
        style={{
          '--m3d-hero-photo': `url(${metHeroBgUrl})`,
        }}
      />
      <div className="museum-3d-shell__vignette" aria-hidden />

      <div className="museum-3d-shell__nav-slot">
        <MuseumNavbar
          displayName={displayName}
          activeRoute={activeRoute}
          onNavigate={onNavigate}
          onSignOut={onSignOut}
          onNavigate3D={onNavigate3D}
        />
      </div>

      <div className="museum-3d-shell__main">{children}</div>
    </div>
  )
}

export function Museum3DLoading() {
  return <div className="museum-3d-shell__loading">Loading</div>
}
