import { useEffect } from 'react'
import {
  closePlaqueInspectPanel,
  usePlaqueInspectFocus,
  usePlaqueInspectPanel,
} from '../world/plaqueInspectStore.js'

export function PlaqueInspectOverlay() {
  const panel = usePlaqueInspectPanel()
  const focus = usePlaqueInspectFocus()

  useEffect(() => {
    if (!panel) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') closePlaqueInspectPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  const showHint = Boolean(focus && focus.canOpen && !panel)

  return (
    <>
      {showHint ? (
        <div
          className="pointer-events-none fixed bottom-10 left-1/2 z-[60] -translate-x-1/2 rounded-lg border border-white/15 bg-black/55 px-4 py-2 text-center text-[13px] tracking-wide text-[#f2ead8] shadow-lg backdrop-blur-sm"
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Press <span className="font-semibold text-amber-100/95">F</span> to inspect
          plaque
          {focus?.canToggleCaption ? (
            <>
              {' '}· Press <span className="font-semibold text-amber-100/95">E</span> to toggle caption
            </>
          ) : null}
        </div>
      ) : null}

      {panel ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/72 p-6 backdrop-blur-[2px]"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default border-0 bg-transparent"
            aria-label="Close plaque"
            onClick={() => closePlaqueInspectPanel()}
          />
          <div
            className="pointer-events-auto relative z-[1] max-h-[min(78vh,720px)] w-full max-w-lg overflow-y-auto rounded-xl border border-amber-900/40 bg-[#14110e] p-8 text-[#f2ead8] shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              className="absolute right-4 top-4 border-0 bg-transparent text-lg leading-none text-neutral-500 hover:text-neutral-300"
              onClick={() => closePlaqueInspectPanel()}
            >
              ×
            </button>
            <div className="pr-8 text-2xl font-semibold leading-snug tracking-tight">
              {panel.title || 'Untitled'}
            </div>
            {panel.artist ? (
              <div className="mt-2 text-sm font-normal italic tracking-wide text-amber-100/85">
                {panel.artist}
              </div>
            ) : (
              <div className="mt-2 text-sm italic text-neutral-500">Artist unknown</div>
            )}
            {panel.description ? (
              <div
                className="mt-6 whitespace-pre-wrap border-t border-white/10 pt-6 text-[15px] leading-relaxed text-[#e8e0d4]"
                style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
              >
                {panel.description}
              </div>
            ) : null}
            <div
              className="mt-8 text-[11px] tracking-wider text-neutral-500"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              Escape or click outside to close
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
