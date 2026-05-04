/**
 * Canonical artwork themes — only these exact strings may appear in `artworks.themes`.
 * Any model output that is not exactly one of these after normalization must either:
 *   match an explicit synonym entry (mapped to one exact label), or
 *   be dropped.
 *
 * Lives next to index.ts so Supabase CLI bundles it with recognize-artwork.
 */
export const MAX_THEMES_PER_ARTWORK = 5

export const ARTWORK_THEME_OPTIONS = [
  'Portrait',
  'Landscape',
  'Still Life',
  'Interior / Domestic Space',
  'Everyday Life',
  'Religious / Spiritual',
  'Mythology',
  'Historical Scene',
  'War / Conflict',
  'Society / Social Commentary',
  'Nature / Botanical',
  'Animals',
  'Architecture / Cityscape',
  'Seascape / Maritime',
  'Abstract',
  'Symbolism / Allegory',
  'Surreal / Dreamlike',
  'Romantic / Love',
  'Death / Mortality',
  'Emotion',
  'Power / Authority',
  'Movement / Motion',
  'Light',
  'Time / Transience',
  'Minimal / Form',
]

const ALLOWED = new Set(ARTWORK_THEME_OPTIONS)

/** Normalize for lookup: hyphens/slashes, bullets, lowercase — never persists. */
export function normalizeThemeKey(s) {
  let t = String(s).trim()
  t = t.replace(/^[\d]+[\).\]]\s*/, '')
  t = t.replace(/^[-*•]\s*/, '')
  t = t.replace(/[-‐‑‒–—]/g, ' ')
  t = t.replace(/\s*[/／]\s*/g, ' / ')
  t = t.replace(/\s+/g, ' ')
  t = t.toLowerCase()
  t = t.replace(/[.,;:!?'"`]+$/g, '')
  return t
}

const CANON_BY_NORMALIZED = new Map(
  ARTWORK_THEME_OPTIONS.map((label) => [normalizeThemeKey(label), label]),
)

/**
 * Explicit synonym → exact canonical label (string must match ARTWORK_THEME_OPTIONS).
 * Only these remappings exist; there is no fuzzy or fallback bucket.
 */
const SYNONYM_PAIRS = [
  // Portrait
  ['figurative', 'Portrait'],
  ['head study', 'Portrait'],
  ['bust', 'Portrait'],
  ['self portrait', 'Portrait'],
  ['potrait', 'Portrait'],
  // Landscape
  ['scenery', 'Landscape'],
  ['vista', 'Landscape'],
  ['pastoral', 'Landscape'],
  ['countryside', 'Landscape'],
  // Still Life
  ['still-life', 'Still Life'],
  ['vanitas', 'Still Life'],
  ['tabletop', 'Still Life'],
  ['objects', 'Still Life'],
  // Interior / Domestic Space
  ['interior', 'Interior / Domestic Space'],
  ['domestic', 'Interior / Domestic Space'],
  ['domestic space', 'Interior / Domestic Space'],
  ['indoors', 'Interior / Domestic Space'],
  ['indoor', 'Interior / Domestic Space'],
  ['room interior', 'Interior / Domestic Space'],
  ['home', 'Interior / Domestic Space'],
  // Everyday Life
  ['everyday life (genre)', 'Everyday Life'],
  ['genre', 'Everyday Life'],
  ['genre painting', 'Everyday Life'],
  ['genre scene', 'Everyday Life'],
  ['daily life', 'Everyday Life'],
  ['mundane', 'Everyday Life'],
  ['ordinary life', 'Everyday Life'],
  // Religious / Spiritual
  ['religious', 'Religious / Spiritual'],
  ['spiritual', 'Religious / Spiritual'],
  ['sacred', 'Religious / Spiritual'],
  ['devotional', 'Religious / Spiritual'],
  ['biblical', 'Religious / Spiritual'],
  ['christian art', 'Religious / Spiritual'],
  ['religion', 'Religious / Spiritual'],
  ['faith', 'Religious / Spiritual'],
  // Mythology
  ['myth', 'Mythology'],
  ['mythological', 'Mythology'],
  ['gods and heroes', 'Mythology'],
  ['legend', 'Mythology'],
  // Historical Scene
  ['historical', 'Historical Scene'],
  ['history painting', 'Historical Scene'],
  // War / Conflict
  ['warfare', 'War / Conflict'],
  ['battle', 'War / Conflict'],
  ['military', 'War / Conflict'],
  ['combat', 'War / Conflict'],
  ['soldiers', 'War / Conflict'],
  ['war', 'War / Conflict'],
  ['violence', 'War / Conflict'],
  // Society / Social Commentary
  ['social commentary', 'Society / Social Commentary'],
  ['political', 'Society / Social Commentary'],
  ['satire', 'Society / Social Commentary'],
  ['social critique', 'Society / Social Commentary'],
  ['critique of society', 'Society / Social Commentary'],
  // Nature / Botanical
  ['nature', 'Nature / Botanical'],
  ['botanical', 'Nature / Botanical'],
  ['plants', 'Nature / Botanical'],
  ['flora', 'Nature / Botanical'],
  ['trees and plants', 'Nature / Botanical'],
  // Animals
  ['wildlife', 'Animals'],
  ['fauna', 'Animals'],
  ['beasts', 'Animals'],
  ['creature', 'Animals'],
  // Architecture / Cityscape
  ['architecture', 'Architecture / Cityscape'],
  ['cityscape', 'Architecture / Cityscape'],
  ['urban', 'Architecture / Cityscape'],
  ['buildings', 'Architecture / Cityscape'],
  ['city view', 'Architecture / Cityscape'],
  ['street scene', 'Architecture / Cityscape'],
  // Seascape / Maritime
  ['seascape', 'Seascape / Maritime'],
  ['maritime', 'Seascape / Maritime'],
  ['ocean', 'Seascape / Maritime'],
  ['sea', 'Seascape / Maritime'],
  ['marine', 'Seascape / Maritime'],
  ['nautical', 'Seascape / Maritime'],
  ['coastal', 'Seascape / Maritime'],
  // Abstract
  ['non-representational', 'Abstract'],
  ['non representational', 'Abstract'],
  // Symbolism / Allegory
  ['symbolism', 'Symbolism / Allegory'],
  ['allegory', 'Symbolism / Allegory'],
  ['symbolic', 'Symbolism / Allegory'],
  // Surreal / Dreamlike
  ['surreal', 'Surreal / Dreamlike'],
  ['surrealism', 'Surreal / Dreamlike'],
  ['dreamlike', 'Surreal / Dreamlike'],
  ['dream', 'Surreal / Dreamlike'],
  ['uncanny', 'Surreal / Dreamlike'],
  // Romantic / Love
  ['romantic', 'Romantic / Love'],
  ['love', 'Romantic / Love'],
  ['romance', 'Romantic / Love'],
  // Death / Mortality
  ['death', 'Death / Mortality'],
  ['mortality', 'Death / Mortality'],
  ['memento mori', 'Death / Mortality'],
  ['dying', 'Death / Mortality'],
  // Emotion
  ['emotional', 'Emotion'],
  ['feelings', 'Emotion'],
  ['feeling', 'Emotion'],
  ['mood', 'Emotion'],
  // Power / Authority
  ['power', 'Power / Authority'],
  ['authority', 'Power / Authority'],
  ['rule', 'Power / Authority'],
  ['dominance', 'Power / Authority'],
  // Movement / Motion
  ['movement', 'Movement / Motion'],
  ['motion', 'Movement / Motion'],
  ['dynamic', 'Movement / Motion'],
  ['kinetic', 'Movement / Motion'],
  // Light
  ['lighting', 'Light'],
  ['chiaroscuro', 'Light'],
  ['luminosity', 'Light'],
  ['sunlight', 'Light'],
  ['shadow and light', 'Light'],
  // Time / Transience
  ['time', 'Time / Transience'],
  ['transience', 'Time / Transience'],
  ['temporality', 'Time / Transience'],
  ['fleeting', 'Time / Transience'],
  // Minimal / Form
  ['minimal', 'Minimal / Form'],
  ['minimalism', 'Minimal / Form'],
  ['geometric', 'Minimal / Form'],
  ['form', 'Minimal / Form'],
]

const SYNONYM_TO_CANON = new Map()
for (const [syn, canon] of SYNONYM_PAIRS) {
  if (!ALLOWED.has(canon)) continue
  SYNONYM_TO_CANON.set(normalizeThemeKey(syn), canon)
}

/**
 * Models often return themes as a string, a nested array, or { theme: "..." }.
 * We do not walk arbitrary objects — only known keys — so stray fields never become themes.
 */
export function coerceThemesToCandidateStrings(value, depth = 0) {
  if (depth > 6) return []
  if (value == null) return []

  if (typeof value === 'string') {
    return value
      .split(/[,;]|\n/)
      .map((p) =>
        p
          .trim()
          .replace(/^[\-\*•\d]+[\.\)]\s*/, '')
          .trim(),
      )
      .filter(Boolean)
  }

  if (Array.isArray(value)) {
    return value.flatMap((v) => coerceThemesToCandidateStrings(v, depth + 1))
  }

  if (typeof value === 'object') {
    const o = /** @type {Record<string, unknown>} */ (value)
    const direct = o.theme ?? o.label ?? o.name ?? o.title
    if (typeof direct === 'string') return [direct]
    return []
  }

  return []
}

function resolveToCanonical(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  let key = normalizeThemeKey(trimmed)
  if (CANON_BY_NORMALIZED.has(key)) return CANON_BY_NORMALIZED.get(key)
  if (SYNONYM_TO_CANON.has(key)) return SYNONYM_TO_CANON.get(key)

  const slashy = trimmed.replace(/\s*[/／]\s*/g, ' / ').replace(/\s+and\s+/gi, ' / ')
  key = normalizeThemeKey(slashy)
  if (CANON_BY_NORMALIZED.has(key)) return CANON_BY_NORMALIZED.get(key)
  if (SYNONYM_TO_CANON.has(key)) return SYNONYM_TO_CANON.get(key)

  return null
}

/** Guarantee storage uses the exact string from ARTWORK_THEME_OPTIONS. */
function exactAllowedLabel(label) {
  if (typeof label !== 'string') return null
  const k = normalizeThemeKey(label)
  const resolved = CANON_BY_NORMALIZED.get(k)
  return resolved ?? null
}

export function normalizeArtworkThemes(raw) {
  const candidates = coerceThemesToCandidateStrings(raw)
  const out = []
  const seen = new Set()
  for (const item of candidates) {
    let canonical = resolveToCanonical(item)
    if (!canonical) continue
    canonical = exactAllowedLabel(canonical)
    if (!canonical || seen.has(canonical)) continue
    if (!ALLOWED.has(canonical)) continue
    seen.add(canonical)
    out.push(canonical)
    if (out.length >= MAX_THEMES_PER_ARTWORK) break
  }
  return out
}

export const THEMES_PROMPT_SECTION = `
For "themes", choose at most ${MAX_THEMES_PER_ARTWORK} values from this list ONLY.
Copy each label EXACTLY as written below (spelling, slashes, punctuation):

${ARTWORK_THEME_OPTIONS.map((t) => `- ${t}`).join('\n')}

Return "themes" as a JSON array of strings (not a comma-separated string). Example: ["Portrait","Landscape"]
Use only labels from the list verbatim. If unsure, omit the theme.
If fewer than ${MAX_THEMES_PER_ARTWORK} labels apply, return fewer.`
