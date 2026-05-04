export function MultiplayerHud({ status, remoteCount }) {
  const label =
    status === 'connected'
      ? 'Online'
      : status === 'connecting'
        ? 'Connecting…'
        : status === 'error'
          ? 'Unreachable'
          : 'Offline'

  const dotClass =
    status === 'connected'
      ? 'bg-emerald-500/90'
      : status === 'connecting'
        ? 'bg-amber-400/90 animate-pulse'
        : 'bg-rose-400/80'

  return (
    <div className="pointer-events-none fixed top-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 text-[11px] font-normal tracking-[0.18em] text-neutral-500">
      <span
        className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
        aria-hidden
      />
      <span>{label}</span>
      <span className="opacity-40">·</span>
      <span>
        {remoteCount} Guest{remoteCount === 1 ? '' : 's'}
      </span>
    </div>
  )
}
