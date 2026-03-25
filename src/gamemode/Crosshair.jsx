import './Crosshair.css'

export function Crosshair({ isReloading = false, reloadProgress = 0, isOutOfAmmo = false }) {
  return (
    <div className="crosshair" aria-hidden>
      {isReloading ? (
        <span
          className="crosshair__reload-ring"
          style={{
            background: `conic-gradient(rgba(255, 245, 220, 0.95) 0 ${reloadProgress * 360}deg, rgba(255, 255, 255, 0.15) ${reloadProgress * 360}deg 360deg)`,
          }}
        />
      ) : null}
      {isOutOfAmmo && !isReloading ? (
        <span className="crosshair__empty-ring" />
      ) : null}
      <span className="crosshair__line crosshair__line--h" />
      <span className="crosshair__line crosshair__line--v" />
      <span className="crosshair__dot" />
    </div>
  )
}
