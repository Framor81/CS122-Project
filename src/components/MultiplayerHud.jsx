import './MultiplayerHud.css'

export function MultiplayerHud({ status, remoteCount }) {
  const label =
    status === 'connected'
      ? 'Online'
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'error'
          ? 'Server unreachable'
          : 'Offline'

  return (
    <div className="multiplayer-hud">
      <span className={`mp-dot mp-dot--${status}`} aria-hidden />
      <span>{label}</span>
      <span className="mp-sep">·</span>
      <span>
        {remoteCount} other{remoteCount === 1 ? '' : 's'} here
      </span>
    </div>
  )
}
