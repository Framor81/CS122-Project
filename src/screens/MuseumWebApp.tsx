import { useCallback, useEffect, useMemo, useState } from 'react'
import { hasSupabaseConfig, supabase } from '../lib/supabaseClient.js'
import { useUserArtworks } from '../hooks/useUserArtworks.js'
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
}

function museumPath(path: string) {
  if (path === '/home') return '/'
  return `/museum${path}`
}

/* -------------------- Authenticated top nav -------------------- */

function AuthedNav({
  displayName,
  activeRoute,
  onNavigate,
  onSignOut,
}: {
  displayName: string
  activeRoute: string
  onNavigate: (path: string) => void
  onSignOut: () => void
}) {
  return (
    <nav className="site-nav">
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
      </div>
      <div className="nav-actions">
        <span className="user-chip">{displayName}</span>
        <button type="button" className="btn" onClick={() => onNavigate('/add-artwork')}>
          + Add Artwork
        </button>
        <button type="button" className="btn btn-ghost" onClick={onSignOut}>
          Sign Out
        </button>
      </div>
    </nav>
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
        <p className="eyebrow">Welcome</p>
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
}: {
  displayName: string
  onNavigate: (path: string) => void
  onSignOut: () => void
  onNavigate3D: () => void
}) {
  return (
    <div className="museum-classic homepage-1-1">
      <AuthedNav
        displayName={displayName}
        activeRoute="/home"
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />

      <section className="hero">
        <p className="eyebrow">Welcome</p>
        <h1>
          Welcome to Your <span className="accent">Personal Museum</span>, {displayName}!
        </h1>
        <p className="explore-label">EXPLORE</p>
      </section>

      <section className="card-grid">
        <a
          className="prototype-link"
          href={museumPath('/collection')}
          onClick={(e) => {
            e.preventDefault()
            onNavigate('/collection')
          }}
        >
          <article className="feature-card">
            <span className="card-kicker">Curated</span>
            <h2>Your Collection</h2>
            <p>Browse and revisit every artwork you've discovered.</p>
            <span className="card-action">ENTER →</span>
          </article>
        </a>
        <a
          className="prototype-link"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            onNavigate3D()
          }}
        >
          <article className="feature-card">
            <span className="card-kicker">Immersive Experience</span>
            <h2>3D Museum</h2>
            <p>Walk through a virtual gallery of your saved works.</p>
            <span className="card-action">ENTER →</span>
          </article>
        </a>
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
}: {
  userId: string
  displayName: string
  onNavigate: (path: string) => void
  onSignOut: () => void
}) {
  const { artworks, loading, error } = useUserArtworks(userId)
  const typedArtworks = artworks as Array<{
    id: string
    title: string | null
    artist: string | null
    date_text: string | null
    themes: string[] | null
    status: string | null
    imageUrl: string
  }>
  const [activeFilter, setActiveFilter] = useState('ALL')

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

  return (
    <div className="museum-classic">
      <AuthedNav
        displayName={displayName}
        activeRoute="/collection"
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />

      <div className="collection-page">
        <div className="collection-head">
          <div>
            <p className="eyebrow">Your Collection</p>
            <h1>All Works</h1>
          </div>
        </div>

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

        {loading ? <p className="page-status">Loading your collection…</p> : null}
        {error ? <p className="page-status" data-kind="error">{error}</p> : null}
        {!loading && !error && typedArtworks.length === 0 ? (
          <p className="page-status">No artworks yet. Add one to begin.</p>
        ) : null}

        <div className="art-grid">
          {visible.map((art) => (
            <button
              key={art.id}
              type="button"
              className="art-card"
              onClick={() => onNavigate(`/artwork?id=${art.id}`)}
            >
              <div
                className="thumb"
                style={{ backgroundImage: `url("${art.imageUrl || ''}")` }}
              />
              <div className="meta">
                <p className="title">
                  {art.title || (art.status === 'pending' ? 'Identifying…' : 'Untitled')}
                </p>
                <p className="subtitle">
                  {art.artist || 'Unknown'}
                  {art.date_text ? ` · ${art.date_text}` : ''}
                </p>
              </div>
            </button>
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
}: {
  userId: string
  displayName: string
  onNavigate: (path: string) => void
  onSignOut: () => void
}) {
  const [status, setStatus] = useState('')

  return (
    <div className="museum-classic">
      <AuthedNav
        displayName={displayName}
        activeRoute="/add-artwork"
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />

      <div className="add-page">
        <h1>Add Images to your Gallery</h1>
        <label className="upload-zone">
          <span>Drag or click to upload an image</span>
          <input
            type="file"
            hidden
            accept="image/*"
            onChange={(e) => {
              void (async () => {
                const file = e.target.files?.[0]
                if (!file || !supabase) return
                try {
                  setStatus('Uploading image…')
                  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
                  const path = `${userId}/${crypto.randomUUID()}.${ext}`
                  const upload = await supabase.storage
                    .from('artworks')
                    .upload(path, file, { contentType: file.type, upsert: false })
                  if (upload.error) throw upload.error

                  const created = await supabase
                    .from('artworks')
                    .insert({ user_id: userId, image_path: path, status: 'pending' })
                    .select('id')
                    .single()
                  if (created.error || !created.data?.id) {
                    throw created.error || new Error('Failed to create row.')
                  }

                  setStatus('Identifying artwork…')
                  const result = await supabase.functions.invoke('recognize-artwork', {
                    body: { artwork_id: created.data.id },
                  })
                  if (result.error) {
                    await supabase
                      .from('artworks')
                      .update({
                        status: 'error',
                        error_message:
                          result.error.message || 'AI recognition is not configured yet.',
                      })
                      .eq('id', created.data.id)
                  }

                  onNavigate(`/artwork?id=${created.data.id}`)
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : 'Upload failed.')
                }
              })()
            }}
          />
        </label>
        {status ? <p className="page-status">{status}</p> : null}
      </div>
    </div>
  )
}

/* -------------------- Artwork detail -------------------- */

function MuseumArtworkDetail({
  displayName,
  onNavigate,
  onSignOut,
  artworkId,
}: {
  displayName: string
  onNavigate: (path: string) => void
  onSignOut: () => void
  artworkId: string | null
}) {
  const [status, setStatus] = useState('Loading…')
  const [artwork, setArtwork] = useState<ArtworkDetail | null>(null)
  const [imageUrl, setImageUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [captionStatus, setCaptionStatus] = useState('')

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
        setStatus('AI is still analyzing this image…')
        for (let i = 0; i < 30; i += 1) {
          await new Promise((r) => window.setTimeout(r, 1500))
          art = await load()
          if (!art || art.status !== 'pending') break
        }
      }

      if (!art) {
        setStatus('Artwork not found.')
        return
      }
      setArtwork(art)
      setCaption(art.caption || '')
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
        <AuthedNav
          displayName={displayName}
          activeRoute="/collection"
          onNavigate={onNavigate}
          onSignOut={onSignOut}
        />
        <div className="add-page">
          <p className="page-status">{status}</p>
          <button
            type="button"
            className="btn"
            onClick={() => onNavigate('/collection')}
          >
            Back to Collection
          </button>
        </div>
      </div>
    )
  }

  const kicker = [artwork.period, artwork.date_text].filter(Boolean).join(' · ').toUpperCase()

  return (
    <div className="museum-classic">
      <AuthedNav
        displayName={displayName}
        activeRoute="/collection"
        onNavigate={onNavigate}
        onSignOut={onSignOut}
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
          <p className="description">{artwork.description || 'No description available.'}</p>

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
          onNavigate3D={onNavigate3D}
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
      />
    )
  }

  if (route === '/artwork' && auth.user) {
    return (
      <MuseumArtworkDetail
        displayName={displayName}
        onNavigate={navigate}
        onSignOut={handleSignOut}
        artworkId={artworkId}
      />
    )
  }

  return (
    <div className="museum-classic">
      <AuthedNav
        displayName={displayName}
        activeRoute="/home"
        onNavigate={navigate}
        onSignOut={handleSignOut}
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
