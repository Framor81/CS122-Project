import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient.js'
import { useUserArtworks } from '../hooks/useUserArtworks.js'
import { MuseumNavbar } from '../components/MuseumNavbar.jsx'
import {
  DEFAULT_DESCRIPTION_PROMPT_ID,
  DESCRIPTION_PROMPT_OPTIONS,
  normalizeDescriptionPromptId,
} from '../../supabase/functions/recognize-artwork/descriptionPrompts.js'
import './MuseumClassicHome.css'

type AuthApi = {
  user: {
    id: string
    email?: string | null
    user_metadata?: { username?: string | null }
  } | null
  error: string
  signIn: (email: string, password: string, username: string) => Promise<{ error: { message?: string } | null }>
  signUp: (email: string, password: string, username: string) => Promise<{ error: { message?: string } | null }>
  signOut: () => Promise<void>
}

type Props = {
  auth: AuthApi
  displayName: string
  onSignedInName: (username: string) => void
  onNavigate3D: () => void
}

type ArtworkDetail = {
  id: string
  title: string | null
  artist: string | null
  date_text: string | null
  themes: string[] | null
  image_path: string
  status: string | null
  period: string | null
  description: string | null
  medium: string | null
  dimensions: string | null
  location_guess: string | null
  caption: string | null
  error_message: string | null
  raw_ai?: { description_prompt?: string } | null
}

type DescriptionPromptId = (typeof DESCRIPTION_PROMPT_OPTIONS)[number]['id']

function museumPath(path: string) {
  if (path === '/home') return '/'
  return `/museum${path}`
}

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
}

function extensionFromName(name: string): string {
  return (name.split('.').pop() || '').trim().toLowerCase()
}

function isSupportedUploadImage(file: File): boolean {
  if (file.type.startsWith('image/')) return true
  return Boolean(EXTENSION_TO_MIME[extensionFromName(file.name)])
}

function uploadContentTypeFor(file: File): string {
  if (file.type.startsWith('image/')) return file.type
  return EXTENSION_TO_MIME[extensionFromName(file.name)] || 'application/octet-stream'
}

function uploadStepLabel(phase: 'uploading' | 'identifying', index: number, total: number) {
  const verb = phase === 'uploading' ? 'Uploading' : 'Identifying'
  if (total === 1) return `${verb} image…`
  return `${verb} ${index} of ${total}…`
}

function DescriptionPromptChooser({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (id: DescriptionPromptId) => void
  disabled?: boolean
}) {
  const selected = normalizeDescriptionPromptId(value)
  return (
    <div className="description-prompt-chooser" aria-label="Description focus">
      {DESCRIPTION_PROMPT_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`description-prompt-option${selected === option.id ? ' is-active' : ''}`}
          disabled={disabled}
          onClick={() => onChange(option.id as DescriptionPromptId)}
        >
          <span className="description-prompt-option__label">{option.label}</span>
          <span className="description-prompt-option__hint">{option.description}</span>
        </button>
      ))}
    </div>
  )
}

/* -------------------- Welcome (unauthenticated home) -------------------- */

function MuseumWelcome({ onNavigate }: { onNavigate: (path: string) => void }) {
  return (
    <div className="museum-classic homepage-2-39">
      <nav className="site-nav">
        <button type="button" className="brand" onClick={() => onNavigate('/home')}>
          MUSEUM
        </button>
        <div className="nav-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => onNavigate('/login')}
          >
            Login
          </button>
        </div>
      </nav>

      <section className="hero">
        <h1>
          Welcome to Your <span className="accent">Personal Museum!</span>
        </h1>
        <p className="explore-label">EXPLORE</p>
      </section>

      <section className="card-grid">
        <a
          className="prototype-link"
          href={museumPath('/login')}
          onClick={(e) => {
            e.preventDefault()
            onNavigate('/login')
          }}
        >
          <article className="feature-card">
            <span className="card-kicker">Curated</span>
            <h2>Your Collection</h2>
            <p>Browse and revisit every artwork you've discovered.</p>
            <span className="card-action">SIGN IN TO ENTER</span>
          </article>
        </a>
        <a
          className="prototype-link"
          href={museumPath('/login')}
          onClick={(e) => {
            e.preventDefault()
            onNavigate('/login')
          }}
        >
          <article className="feature-card">
            <span className="card-kicker">Immersive Experience</span>
            <h2>3D Museum</h2>
            <p>Walk through a virtual gallery of your saved works.</p>
            <span className="card-action">SIGN IN TO ENTER</span>
          </article>
        </a>
      </section>
    </div>
  )
}

/* -------------------- Login -------------------- */

function MuseumLogin({
  auth,
  onNavigate,
  onSignedInName,
}: {
  auth: AuthApi
  onNavigate: (path: string) => void
  onSignedInName: (username: string) => void
}) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [localError, setLocalError] = useState('')
  const [busy, setBusy] = useState(false)

  const canSubmit =
    email.trim().length > 3 &&
    password.length >= 6 &&
    (mode === 'signin' || username.trim().length > 0) &&
    !busy

  const submit = async () => {
    if (!canSubmit) return
    setBusy(true)
    setLocalError('')
    const fn = mode === 'signin' ? auth.signIn : auth.signUp
    const result = await fn(email.trim(), password, username.trim())
    setBusy(false)
    if (result.error) {
      setLocalError(result.error.message || 'Authentication failed.')
      return
    }
    if (username.trim()) onSignedInName(username.trim())
    onNavigate('/home')
  }

  const statusText = auth.error || localError || (busy ? (mode === 'signup' ? 'Creating account…' : 'Signing in…') : '')
  const statusKind = auth.error || localError ? 'error' : 'info'

  return (
    <div className="museum-classic login-page-308">
      <form
        className="login-card"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <p className="brand">MUSEUM</p>
        <h1>Personal Museum</h1>

        {mode === 'signup' ? (
          <div className="field">
            <label htmlFor="login-username">Username</label>
            <input
              id="login-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              maxLength={24}
              required
            />
          </div>
        ) : null}

        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <p className="login-status" data-kind={statusKind} role="alert" aria-live="polite">
          {!hasSupabaseConfig
            ? 'Missing Supabase config. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.'
            : statusText}
        </p>

        <div className="actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!canSubmit || !hasSupabaseConfig}
          >
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
          >
            {mode === 'signin' ? 'Create Account' : 'Have an Account? Sign In'}
          </button>
        </div>

        <button
          type="button"
          className="home-link"
          onClick={() => onNavigate('/home')}
        >
          HOME
        </button>
      </form>
    </div>
  )
}

/* -------------------- Authenticated home -------------------- */

function MuseumHome({
  displayName,
  onNavigate,
  onSignOut,
  onNavigate3D,
  canEnter3D,
  museumEntryLoading,
}: {
  displayName: string
  onNavigate: (path: string) => void
  onSignOut: () => void
  onNavigate3D: () => void
  canEnter3D: boolean
  museumEntryLoading: boolean
}) {
  return (
    <div className="museum-classic homepage-1-1">
      <MuseumNavbar
        displayName={displayName}
        activeRoute="/home"
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        onNavigate3D={onNavigate3D}
        canEnter3D={canEnter3D}
        museumEntryHint="Upload at least one artwork before entering the 3D museum."
      />

      <section className="hero">
        <h1>
          Welcome to Your <span className="accent">Personal Museum</span>
          {displayName ? `, ${displayName}` : ''}!
        </h1>
        <p className="hero-lead">
          Begin by adding artworks to your collection. Once you have saved works, you can explore them in your 3D
          museum.
        </p>
      </section>

      <section className="home-flow" aria-labelledby="home-flow-heading">
        <p id="home-flow-heading" className="home-flow-heading">
          How it works
        </p>

        <div
          className={`home-flow-progress${canEnter3D ? ' home-flow-progress--step2' : ''}`}
          aria-hidden="true"
        >
          <span className={`home-flow-dot ${canEnter3D ? 'is-complete' : 'is-current'}`}>1</span>
          <span className="home-flow-line" />
          <span className={`home-flow-dot ${canEnter3D ? 'is-current' : ''}`}>2</span>
        </div>

        <div className="home-flow-grid">
          <button
            type="button"
            className="home-flow-card home-flow-card--step1 home-flow-card--clickable"
            onClick={() => onNavigate('/collection')}
          >
            <p className="home-flow-step-label">Step 1</p>
            <h2 className="home-flow-title">Build Your Collection</h2>
            <p className="home-flow-desc">Save and organize artworks you discover.</p>
            <div className="home-flow-icon home-flow-icon--collection" aria-hidden="true">
              <svg viewBox="0 0 64 64" width="56" height="56" fill="none">
                <rect x="10" y="14" width="44" height="36" rx="2" stroke="currentColor" strokeWidth="2" />
                <circle cx="24" cy="28" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M14 42 L28 30 L38 38 L50 26" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="48" cy="46" r="10" fill="#111" stroke="currentColor" strokeWidth="1.5" />
                <path d="M48 42 V50 M44 46 H52" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="home-flow-card-foot">Start Collecting →</p>
          </button>

          {canEnter3D ? (
            <button
              type="button"
              className="home-flow-card home-flow-card--step2 home-flow-card--clickable is-unlocked"
              disabled={museumEntryLoading}
              onClick={() => onNavigate3D()}
            >
              <p className="home-flow-step-label">Step 2</p>
              <h2 className="home-flow-title">Explore Your 3D Museum</h2>
              <p className="home-flow-desc">Walk through a virtual gallery created from your saved works.</p>
              <div className="home-flow-icon home-flow-icon--museum" aria-hidden="true">
                <svg viewBox="0 0 64 64" width="56" height="56" fill="none">
                  <path d="M32 8 L54 22 V52 H10 V22 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M18 52 V34 H26 V52 M38 52 V34 H46 V52" stroke="currentColor" strokeWidth="2" />
                  <path d="M10 52 H54" stroke="currentColor" strokeWidth="2" />
                  <rect x="27" y="26" width="10" height="8" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <p className="home-flow-card-foot">
                {museumEntryLoading ? 'Opening…' : 'Enter 3D Museum →'}
              </p>
            </button>
          ) : (
            <div className="home-flow-card home-flow-card--step2 is-locked" role="region" aria-label="Step 2 — locked">
              <p className="home-flow-step-label">Step 2</p>
              <h2 className="home-flow-title">Explore Your 3D Museum</h2>
              <p className="home-flow-desc">Walk through a virtual gallery created from your saved works.</p>
              <div className="home-flow-icon home-flow-icon--museum" aria-hidden="true">
                <svg viewBox="0 0 64 64" width="56" height="56" fill="none">
                  <path d="M32 8 L54 22 V52 H10 V22 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                  <path d="M18 52 V34 H26 V52 M38 52 V34 H46 V52" stroke="currentColor" strokeWidth="2" />
                  <path d="M10 52 H54" stroke="currentColor" strokeWidth="2" />
                  <rect x="27" y="26" width="10" height="8" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </div>
              <div className="home-flow-lock-panel">
                <p className="home-flow-lock-text">
                  <span className="home-flow-lock-icon" aria-hidden="true">
                    🔒
                  </span>{' '}
                  Add artworks to your collection first. Once you have saved works, this will be available.
                </p>
              </div>
            </div>
          )}
        </div>

        {!canEnter3D ? (
          <p className="home-flow-footer-hint">
            <span aria-hidden="true">✨</span> Add artworks to unlock your 3D museum.
          </p>
        ) : null}
      </section>
    </div>
  )
}

/* -------------------- Collection -------------------- */

function MuseumCollection({
  userId,
  displayName,
  onNavigate,
  onSignOut,
  onNavigate3D,
  canEnter3D,
}: {
  userId: string
  displayName: string
  onNavigate: (path: string) => void
  onSignOut: () => void
  onNavigate3D: () => void
  canEnter3D: boolean
}) {
  const { artworks, loading, error, reload } = useUserArtworks(userId)
  const typedArtworks = artworks as Array<{
    id: string
    title: string | null
    artist: string | null
    date_text: string | null
    themes: string[] | null
    status: string | null
    imageUrl: string
    image_path: string
  }>
  const [activeFilter, setActiveFilter] = useState('ALL')
  const [reanalyzeProgress, setReanalyzeProgress] = useState<{
    current: number
    total: number
  } | null>(null)
  const [actionBanner, setActionBanner] = useState<{ text: string; kind?: 'error' } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const filters = useMemo(() => {
    const tags = new Set(['ALL'])
    typedArtworks.forEach((art) => {
      ;(art.themes || []).forEach((t) => tags.add(String(t).toUpperCase()))
    })
    return [...tags]
  }, [typedArtworks])

  const visible = useMemo(() => {
    if (activeFilter === 'ALL') return typedArtworks
    return typedArtworks.filter((a) =>
      (a.themes || []).map((t) => String(t).toUpperCase()).includes(activeFilter),
    )
  }, [activeFilter, typedArtworks])

  const reanalyzeCollection = async () => {
    if (!supabase || typedArtworks.length === 0 || reanalyzeProgress) return
    const ok = window.confirm(
      `Re-analyze all ${typedArtworks.length} artwork(s)? This runs AI on each image and may take a few minutes.`,
    )
    if (!ok) return
    setActionBanner(null)
    let errorCount = 0
    for (let i = 0; i < typedArtworks.length; i += 1) {
      const art = typedArtworks[i]
      setReanalyzeProgress({ current: i + 1, total: typedArtworks.length })
      await supabase
        .from('artworks')
        .update({ status: 'pending', error_message: null })
        .eq('id', art.id)
      const result = await supabase.functions.invoke('recognize-artwork', {
        body: { artwork_id: art.id },
      })
      if (result.error) {
        errorCount += 1
        await supabase
          .from('artworks')
          .update({
            status: 'error',
            error_message: result.error.message || 'Recognition failed.',
          })
          .eq('id', art.id)
      }
    }
    setReanalyzeProgress(null)
    setActionBanner(
      errorCount > 0
        ? {
            text: `Finished with ${errorCount} error(s). Open an artwork for details, or try again.`,
            kind: 'error',
          }
        : { text: 'Tags and metadata refreshed for your whole collection.' },
    )
    await reload()
  }

  const deleteArtwork = async (art: (typeof typedArtworks)[0]) => {
    if (!supabase || deletingId) return
    const ok = window.confirm('Remove this artwork from your collection? This cannot be undone.')
    if (!ok) return
    setActionBanner(null)
    setDeletingId(art.id)
    try {
      const { error: storageErr } = await supabase.storage.from('artworks').remove([art.image_path])
      if (storageErr) {
        console.warn(storageErr)
      }
      const { error: rowErr } = await supabase.from('artworks').delete().eq('id', art.id)
      if (rowErr) throw rowErr
    } catch (err) {
      setActionBanner({
        text: err instanceof Error ? err.message : 'Could not delete artwork.',
        kind: 'error',
      })
    } finally {
      setDeletingId(null)
    }
  }

  const reanalyzeBusy = Boolean(reanalyzeProgress)

  return (
    <div className="museum-classic">
      <MuseumNavbar
        displayName={displayName}
        activeRoute="/collection"
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        onNavigate3D={onNavigate3D}
        canEnter3D={canEnter3D || typedArtworks.length > 0}
        museumEntryHint="Upload at least one artwork before entering the 3D museum."
      />

      <div className="collection-page">
        <div className="collection-head">
          <div>
            <p className="eyebrow">Your Collection</p>
            <h1>All Works</h1>
          </div>
          {hasSupabaseConfig ? (
            <div className="collection-head-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onNavigate('/add-artwork')}
              >
                + Add artwork
              </button>
              {typedArtworks.length > 0 ? (
                <button
                  type="button"
                  className="btn"
                  disabled={reanalyzeBusy || loading || !supabase}
                  onClick={() => {
                    void reanalyzeCollection()
                  }}
                >
                  {reanalyzeBusy && reanalyzeProgress
                    ? `Refreshing tags… (${reanalyzeProgress.current}/${reanalyzeProgress.total})`
                    : 'Refresh tags'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {typedArtworks.length > 0 ? (
          <div className="filter-bar">
            {filters.map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${activeFilter === f ? 'is-active' : ''}`}
                onClick={() => setActiveFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? <p className="page-status">Loading your collection…</p> : null}
        {reanalyzeBusy && reanalyzeProgress ? (
          <p className="page-status identify-gallery-status">
            <span className="identify-spinner" aria-hidden="true" />
            Refreshing tags {reanalyzeProgress.current}/{reanalyzeProgress.total}…
          </p>
        ) : null}
        {error ? <p className="page-status" data-kind="error">{error}</p> : null}
        {!loading && !error && typedArtworks.length === 0 ? (
          <div className="collection-empty">
            <button
              type="button"
              className="collection-empty-cta"
              onClick={() => onNavigate('/add-artwork')}
            >
              <span className="collection-empty-cta__plus" aria-hidden>
                +
              </span>
              <span className="collection-empty-cta__label">Add artwork</span>
            </button>
            <p className="page-status collection-empty-hint">No artworks yet. Add one to begin.</p>
          </div>
        ) : null}
        {actionBanner ? (
          <p className="page-status" data-kind={actionBanner.kind === 'error' ? 'error' : undefined}>
            {actionBanner.text}
          </p>
        ) : null}

        <div className="art-grid">
          {visible.map((art) => (
            <div key={art.id} className="art-card">
              <button
                type="button"
                className="art-card-main"
                onClick={() => onNavigate(`/artwork?id=${art.id}`)}
              >
                <div
                  className="thumb"
                  style={{ backgroundImage: `url("${art.imageUrl || ''}")` }}
                />
                <div className="meta">
                  <p className="title">
                    {art.status === 'pending' ? (
                      <span className="art-card-pending">
                        <span className="identify-spinner" aria-hidden="true" />
                        Identifying…
                      </span>
                    ) : (
                      art.title || 'Untitled'
                    )}
                  </p>
                  <p className="subtitle">
                    {art.artist || 'Unknown'}
                    {art.date_text ? ` · ${art.date_text}` : ''}
                  </p>
                </div>
              </button>
              <button
                type="button"
                className="art-card-delete"
                disabled={deletingId === art.id || reanalyzeBusy}
                aria-label="Delete artwork"
                onClick={() => {
                  void deleteArtwork(art)
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* -------------------- Add Artwork -------------------- */

function MuseumAddArtwork({
  userId,
  displayName,
  onNavigate,
  onSignOut,
  onNavigate3D,
  canEnter3D,
}: {
  userId: string
  displayName: string
  onNavigate: (path: string) => void
  onSignOut: () => void
  onNavigate3D: () => void
  canEnter3D: boolean
}) {
  const [status, setStatus] = useState('')
  const [uploadPhase, setUploadPhase] = useState<'idle' | 'uploading' | 'identifying'>('idle')
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null)
  const [uploadPreview, setUploadPreview] = useState<{ url: string; name: string } | null>(null)
  const [descriptionPrompt, setDescriptionPrompt] = useState<DescriptionPromptId>(
    DEFAULT_DESCRIPTION_PROMPT_ID,
  )
  const uploadBusy = uploadPhase !== 'idle'

  useEffect(() => {
    return () => {
      if (uploadPreview) URL.revokeObjectURL(uploadPreview.url)
    }
  }, [uploadPreview])

  return (
    <div className="museum-classic">
      <MuseumNavbar
        displayName={displayName}
        activeRoute="/add-artwork"
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        onNavigate3D={onNavigate3D}
        canEnter3D={canEnter3D}
        museumEntryHint="Finish uploading artwork before entering the 3D museum."
      />

      <div className="add-page">
        <h1>Add Images to your Gallery</h1>
        <div className="upload-context-panel">
          <p className="section-title">Description focus</p>
          <DescriptionPromptChooser
            value={descriptionPrompt}
            onChange={setDescriptionPrompt}
            disabled={uploadBusy}
          />
        </div>
        <label className="upload-zone">
          <span className="upload-zone__title">Drag or click to upload images</span>
          <span className="upload-zone__hint">Select one or multiple photos</span>
          <input
            type="file"
            hidden
            accept="image/*"
            multiple
            onChange={(e) => {
              void (async () => {
                const files = Array.from(e.target.files || []).filter(isSupportedUploadImage)
                e.target.value = ''
                if (files.length === 0 || !supabase) return
                const total = files.length
                const totalSteps = total * 2
                const ids: string[] = []
                const failures: string[] = []
                try {
                  for (let i = 0; i < files.length; i += 1) {
                    const file = files[i]
                    const n = i + 1
                    const previewUrl = URL.createObjectURL(file)
                    setUploadPreview((previous) => {
                      if (previous) URL.revokeObjectURL(previous.url)
                      return { url: previewUrl, name: file.name }
                    })
                    setUploadPhase('uploading')
                    setUploadProgress({ current: i * 2, total: totalSteps })
                    setStatus(uploadStepLabel('uploading', n, total))
                    const ext = extensionFromName(file.name) || 'jpg'
                    const path = `${userId}/${crypto.randomUUID()}.${ext}`
                    const upload = await supabase.storage
                      .from('artworks')
                      .upload(path, file, { contentType: uploadContentTypeFor(file), upsert: false })
                    if (upload.error) {
                      failures.push(`${file.name}: ${upload.error.message}`)
                      continue
                    }

                    const created = await supabase
                      .from('artworks')
                      .insert({ user_id: userId, image_path: path, status: 'pending' })
                      .select('id')
                      .single()
                    if (created.error || !created.data?.id) {
                      failures.push(
                        `${file.name}: ${created.error?.message || 'Could not save artwork.'}`,
                      )
                      continue
                    }

                    const artworkId = created.data.id
                    ids.push(artworkId)
                    setUploadPhase('identifying')
                    setUploadProgress({ current: i * 2 + 1, total: totalSteps })
                    setStatus(uploadStepLabel('identifying', n, total))
                    const result = await supabase.functions.invoke('recognize-artwork', {
                      body: { artwork_id: artworkId, description_prompt: descriptionPrompt },
                    })
                    if (result.error) {
                      await supabase
                        .from('artworks')
                        .update({
                          status: 'error',
                          error_message:
                            result.error.message || 'AI recognition is not configured yet.',
                        })
                        .eq('id', artworkId)
                    }
                    setUploadProgress({ current: i * 2 + 2, total: totalSteps })
                  }

                  setUploadPhase('idle')
                  setUploadProgress(null)
                  setUploadPreview((previous) => {
                    if (previous) URL.revokeObjectURL(previous.url)
                    return null
                  })

                  if (ids.length === 0) {
                    setStatus(
                      failures.length > 0
                        ? failures.join(' ')
                        : 'No images could be uploaded.',
                    )
                    return
                  }

                  if (failures.length > 0) {
                    setStatus(
                      `Added ${ids.length} of ${total}. ${failures.slice(0, 2).join(' ')}${failures.length > 2 ? '…' : ''}`,
                    )
                    await new Promise((r) => setTimeout(r, 2600))
                  } else {
                    setStatus('')
                  }

                  if (ids.length === 1) {
                    onNavigate(`/artwork?id=${ids[0]}`)
                  } else {
                    onNavigate('/collection')
                  }
                } catch (err) {
                  setUploadPhase('idle')
                  setUploadProgress(null)
                  setUploadPreview((previous) => {
                    if (previous) URL.revokeObjectURL(previous.url)
                    return null
                  })
                  setStatus(err instanceof Error ? err.message : 'Upload failed.')
                }
              })()
            }}
          />
        </label>
        {uploadPhase !== 'idle' && uploadProgress ? (
          <div className="identify-status upload-progress-card">
            {uploadPreview ? (
              <div
                className="upload-progress-preview"
                style={{ backgroundImage: `url("${uploadPreview.url}")` }}
                aria-label={`Processing ${uploadPreview.name}`}
              />
            ) : null}
            <p className="page-status">{status}</p>
            <div className="identify-progress-wrap">
              <div
                className="identify-progress-bar"
                style={{
                  width: `${Math.min(100, Math.max(0, (uploadProgress.current / uploadProgress.total) * 100))}%`,
                }}
              />
            </div>
          </div>
        ) : status ? (
          <p className="page-status">{status}</p>
        ) : null}
      </div>
    </div>
  )
}

/* -------------------- Artwork detail -------------------- */

function MuseumArtworkDetail({
  displayName,
  onNavigate,
  onSignOut,
  onNavigate3D,
  canEnter3D,
  artworkId,
}: {
  displayName: string
  onNavigate: (path: string) => void
  onSignOut: () => void
  onNavigate3D: () => void
  canEnter3D: boolean
  artworkId: string | null
}) {
  const [status, setStatus] = useState('Loading…')
  const [artwork, setArtwork] = useState<ArtworkDetail | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [captionStatus, setCaptionStatus] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [descriptionPrompt, setDescriptionPrompt] = useState<DescriptionPromptId>(
    DEFAULT_DESCRIPTION_PROMPT_ID,
  )
  const [descriptionStatus, setDescriptionStatus] = useState('')
  const [isRegeneratingDescription, setIsRegeneratingDescription] = useState(false)

  useEffect(() => {
    void (async () => {
      const db = supabase
      if (!db) return
      const id = artworkId
      if (!id) {
        setStatus('No artwork id in the URL.')
        return
      }

      const load = async () => {
        const result = await db.from('artworks').select('*').eq('id', id).single()
        if (result.error || !result.data) return null
        return result.data as ArtworkDetail
      }

      let art = await load()
      if (!art) {
        setStatus('Artwork not found.')
        return
      }
      if (art.status === 'pending') {
        setIsAnalyzing(true)
        setStatus('AI is analyzing this image…')
        for (let i = 0; i < 30; i += 1) {
          await new Promise((r) => window.setTimeout(r, 1500))
          art = await load()
          if (!art || art.status !== 'pending') break
        }
        setIsAnalyzing(false)
      }

      if (!art) {
        setStatus('Artwork not found.')
        return
      }
      setArtwork(art)
      setCaption(art.caption || '')
      setDescriptionPrompt(
        normalizeDescriptionPromptId(art.raw_ai?.description_prompt) as DescriptionPromptId,
      )
      setStatus(
        art.status === 'error'
          ? `Saved, but AI analysis failed: ${art.error_message || 'unknown error'}`
          : '',
      )
      const signed = await db.storage.from('artworks').createSignedUrl(art.image_path, 3600)
      if (!signed.error && signed.data?.signedUrl) setImageUrl(signed.data.signedUrl)
    })()
  }, [artworkId])

  if (!artwork) {
    return (
      <div className="museum-classic">
        <MuseumNavbar
          displayName={displayName}
          activeRoute="/collection"
          onNavigate={onNavigate}
          onSignOut={onSignOut}
          onNavigate3D={onNavigate3D}
          canEnter3D={canEnter3D}
          museumEntryHint="Upload at least one artwork before entering the 3D museum."
        />
        <div className="add-page">
          {isAnalyzing ? (
            <div className="identify-status">
              <p className="page-status">{status}</p>
            </div>
          ) : (
            <p className="page-status">{status}</p>
          )}
          <button
            type="button"
            className="btn"
            style={{ marginTop: '24px' }}
            onClick={() => onNavigate('/collection')}
          >
            Back to Collection
          </button>
        </div>
      </div>
    )
  }

  const kicker = [artwork.period, artwork.date_text].filter(Boolean).join(' · ').toUpperCase()
  const regenerateDescription = async () => {
    const db = supabase
    if (!db || !artwork || isRegeneratingDescription) return
    setIsRegeneratingDescription(true)
    setDescriptionStatus('Updating description…')
    await db
      .from('artworks')
      .update({ status: 'pending', error_message: null })
      .eq('id', artwork.id)
    const result = await db.functions.invoke('recognize-artwork', {
      body: { artwork_id: artwork.id, description_prompt: descriptionPrompt },
    })
    if (result.error) {
      setDescriptionStatus(result.error.message || 'Description update failed.')
      await db
        .from('artworks')
        .update({
          status: 'error',
          error_message: result.error.message || 'Description update failed.',
        })
        .eq('id', artwork.id)
      setIsRegeneratingDescription(false)
      return
    }
    const refreshed = await db.from('artworks').select('*').eq('id', artwork.id).single()
    if (!refreshed.error && refreshed.data) {
      setArtwork(refreshed.data as ArtworkDetail)
      setDescriptionStatus('Description updated.')
      setStatus('')
    } else {
      setDescriptionStatus(refreshed.error?.message || 'Description updated; reload to see it.')
    }
    setIsRegeneratingDescription(false)
  }

  return (
    <div className="museum-classic">
      <MuseumNavbar
        displayName={displayName}
        activeRoute="/collection"
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        onNavigate3D={onNavigate3D}
        canEnter3D={canEnter3D}
        museumEntryHint="Upload at least one artwork before entering the 3D museum."
      />

      <div className="detail-page">
        <div
          className="detail-image"
          style={{ backgroundImage: imageUrl ? `url("${imageUrl}")` : undefined }}
        />
        <div className="detail-body">
          {kicker ? <p className="eyebrow">{kicker}</p> : null}
          <h1>{artwork.title || 'Untitled'}</h1>
          <p className="artist">{artwork.artist || 'Unknown artist'}</p>

          <p className="section-title">Description</p>
          <div className="description-controls">
            <DescriptionPromptChooser
              value={descriptionPrompt}
              onChange={setDescriptionPrompt}
              disabled={isRegeneratingDescription}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={isRegeneratingDescription}
              onClick={() => {
                void regenerateDescription()
              }}
            >
              {isRegeneratingDescription ? 'Updating…' : 'Update Description'}
            </button>
          </div>
          <p className="description">{artwork.description || 'No description available.'}</p>
          {descriptionStatus ? <p className="page-status">{descriptionStatus}</p> : null}

          <div className="meta-grid">
            {[
              ['Medium', artwork.medium],
              ['Dimensions', artwork.dimensions],
              ['Date', artwork.date_text],
              ['Location', artwork.location_guess],
            ]
              .filter(([, v]) => Boolean(v))
              .map(([k, v]) => (
                <div key={k as string} className="cell">
                  <p className="k">{k}</p>
                  <p className="v">{v}</p>
                </div>
              ))}
          </div>

          <p className="section-title">Themes</p>
          <div className="tag-row">
            {(artwork.themes || []).map((t) => (
              <span key={t} className="tag">
                {String(t).toUpperCase()}
              </span>
            ))}
          </div>

          <p className="section-title">Your Caption</p>
          <textarea
            rows={3}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <div className="detail-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void (async () => {
                  const db = supabase
                  if (!db) return
                  setCaptionStatus('Saving…')
                  const result = await db
                    .from('artworks')
                    .update({ caption })
                    .eq('id', artwork.id)
                  setCaptionStatus(
                    result.error ? result.error.message || 'Save failed.' : 'Saved.',
                  )
                })()
              }}
            >
              Save Caption
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => onNavigate('/collection')}
            >
              Back to Collection
            </button>
          </div>
          {captionStatus ? <p className="page-status">{captionStatus}</p> : null}
          {status ? <p className="page-status">{status}</p> : null}
        </div>
      </div>
    </div>
  )
}

/* -------------------- Router shell -------------------- */

export function MuseumWebApp({ auth, displayName, onSignedInName, onNavigate3D }: Props) {
  const entryArtworks = useUserArtworks(auth.user?.id || null)
  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }))

  useEffect(() => {
    const onPop = () =>
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      })
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const pathname = locationState.pathname
  const route =
    pathname === '/' || pathname === '/museum/home'
      ? '/home'
      : pathname.replace(/^\/museum/, '') || '/welcome'
  const artworkId = useMemo(() => {
    if (!locationState.search) return null
    const params = new URLSearchParams(locationState.search)
    return params.get('id')
  }, [locationState.search])

  const navigate = useCallback((path: string) => {
    const next = museumPath(path)
    const current = `${window.location.pathname}${window.location.search}`
    if (current === next) return
    window.history.pushState({}, '', next)
    setLocationState({
      pathname: window.location.pathname,
      search: window.location.search,
    })
  }, [])

  const handleSignOut = useCallback(async () => {
    await auth.signOut()
    navigate('/home')
  }, [auth, navigate])
  const canEnter3D = Boolean(auth.user && entryArtworks.artworks.length > 0)
  const guardedNavigate3D = useCallback(() => {
    if (!canEnter3D) {
      navigate('/add-artwork')
      return
    }
    onNavigate3D()
  }, [canEnter3D, navigate, onNavigate3D])

  useEffect(() => {
    const needsAuth = route === '/collection' || route === '/add-artwork' || route === '/artwork'
    if (!auth.user && needsAuth) {
      navigate('/login')
      return
    }
    if (auth.user && route === '/login') {
      navigate('/home')
    }
  }, [auth.user, navigate, route])

  if (route === '/login') {
    return <MuseumLogin auth={auth} onNavigate={navigate} onSignedInName={onSignedInName} />
  }

  if (route === '/home') {
    if (auth.user) {
      return (
        <MuseumHome
          displayName={displayName}
          onNavigate={navigate}
          onSignOut={handleSignOut}
          onNavigate3D={guardedNavigate3D}
          canEnter3D={canEnter3D}
          museumEntryLoading={entryArtworks.loading}
        />
      )
    }
    return <MuseumWelcome onNavigate={navigate} />
  }

  if (route === '/welcome') {
    return <MuseumWelcome onNavigate={navigate} />
  }

  if (route === '/collection' && auth.user) {
    return (
      <MuseumCollection
        userId={auth.user.id}
        displayName={displayName}
        onNavigate={navigate}
        onSignOut={handleSignOut}
        onNavigate3D={guardedNavigate3D}
        canEnter3D={canEnter3D}
      />
    )
  }

  if (route === '/add-artwork' && auth.user) {
    return (
      <MuseumAddArtwork
        userId={auth.user.id}
        displayName={displayName}
        onNavigate={navigate}
        onSignOut={handleSignOut}
        onNavigate3D={guardedNavigate3D}
        canEnter3D={canEnter3D}
      />
    )
  }

  if (route === '/artwork' && auth.user) {
    return (
      <MuseumArtworkDetail
        displayName={displayName}
        onNavigate={navigate}
        onSignOut={handleSignOut}
        onNavigate3D={guardedNavigate3D}
        canEnter3D={canEnter3D}
        artworkId={artworkId}
      />
    )
  }

  return (
    <div className="museum-classic">
      <MuseumNavbar
        displayName={displayName}
        activeRoute="/home"
        onNavigate={navigate}
        onSignOut={handleSignOut}
        onNavigate3D={guardedNavigate3D}
        canEnter3D={canEnter3D}
        museumEntryHint="Upload at least one artwork before entering the 3D museum."
      />
      <div className="add-page">
        <h1>Page not found</h1>
        <button type="button" className="btn" onClick={() => navigate('/home')}>
          Go Home
        </button>
      </div>
    </div>
  )
}
