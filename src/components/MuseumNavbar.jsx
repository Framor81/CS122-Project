import '../screens/MuseumClassicHome.css'

/**
 * Top navigation for the museum web app and 3D flows (gate, lobby, live session).
 * Appearance is defined in MuseumClassicHome.css (`.museum-site-nav-scope` + `.site-nav`).
 */
export function MuseumNavbar({
  displayName,
  activeRoute = '',
  onNavigate,
  onSignOut,
  onNavigate3D,
  canEnter3D = true,
  museumEntryHint = '',
  className = '',
}) {
  return (
    <div className={`museum-site-nav-scope ${className}`.trim()}>
      <nav className="site-nav" aria-label="Museum">
        <button type="button" className="brand" onClick={() => onNavigate('/home')}>
          MUSEUM
        </button>
        <div className="nav-links">
          <button
            type="button"
            className={activeRoute === '/home' ? 'is-active' : ''}
            onClick={() => onNavigate('/home')}
          >
            HOME
          </button>
          <button
            type="button"
            className={activeRoute === '/collection' ? 'is-active' : ''}
            onClick={() => onNavigate('/collection')}
          >
            COLLECTION
          </button>
          {typeof onNavigate3D === 'function' ? (
            <button
              type="button"
              disabled={!canEnter3D}
              title={!canEnter3D ? museumEntryHint || 'Upload artwork before entering the 3D museum.' : undefined}
              onClick={() => onNavigate3D()}
            >
              {canEnter3D ? '3D MUSEUM' : 'UPLOAD ART FIRST'}
            </button>
          ) : null}
        </div>
        <div className="nav-actions">
          <button type="button" className="btn" onClick={() => onNavigate('/add-artwork')}>
            + Add Artwork
          </button>
          <span className="user-chip">{displayName}</span>
          <button type="button" className="btn btn-ghost" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </nav>
    </div>
  )
}
