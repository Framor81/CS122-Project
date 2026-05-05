import { useCallback, useEffect, useMemo, useState } from 'react'

const MAX_PICKS = 5

export function SessionFavoritesModal({
  open,
  loading,
  error,
  artworks,
  onConfirm,
}) {
  const [selected, setSelected] = useState(() => new Set())

  useEffect(() => {
    if (open) setSelected(new Set())
  }, [open])

  const selectedList = useMemo(() => [...selected], [selected])

  const toggle = useCallback(
    (rawId) => {
      const id = String(rawId)
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
          return next
        }
        if (next.size >= MAX_PICKS) return prev
        next.add(id)
        return next
      })
    },
    [],
  )

  if (!open) return null

  return (
    <div className="m3d-favorites-overlay" role="dialog" aria-modal="true" aria-labelledby="m3d-favorites-title">
      <div className="m3d-favorites-dialog">
        <h2 id="m3d-favorites-title" className="m3d-favorites-title">
          Choose up to five for this visit
        </h2>
        <p className="m3d-favorites-sub">
          From your own uploads, pick the pieces you want eligible for the gallery walls. Everyone picks separately.
        </p>
        <div className="m3d-favorites-counter" aria-live="polite">
          {selectedList.length} / {MAX_PICKS} selected
        </div>
        {loading ? (
          <p className="m3d-favorites-loading">Loading your artwork…</p>
        ) : error ? (
          <p className="m3d-favorites-error" role="alert">
            {error}
          </p>
        ) : artworks.length === 0 ? (
          <p className="m3d-favorites-empty">You don&apos;t have any uploaded artwork yet.</p>
        ) : (
          <div className="m3d-favorites-grid">
            {artworks.map((art) => {
              const sid = String(art.id)
              const isOn = selected.has(sid)
              const blocked = !isOn && selected.size >= MAX_PICKS
              return (
                <button
                  key={sid}
                  type="button"
                  className={`m3d-favorites-tile${isOn ? ' is-selected' : ''}${blocked ? ' is-blocked' : ''}`}
                  onClick={() => !blocked && toggle(sid)}
                  aria-pressed={isOn}
                  aria-disabled={blocked}
                  title={art.title || 'Untitled'}
                >
                  <img src={art.imageUrl} alt="" className="m3d-favorites-thumb" draggable={false} />
                  {isOn ? <span className="m3d-favorites-check" aria-hidden /> : null}
                </button>
              )
            })}
          </div>
        )}
        <div className="m3d-favorites-actions">
          <button
            type="button"
            className="m3d-favorites-save"
            disabled={loading}
            onClick={() => onConfirm(selectedList)}
          >
            Save picks
          </button>
        </div>
      </div>
    </div>
  )
}
