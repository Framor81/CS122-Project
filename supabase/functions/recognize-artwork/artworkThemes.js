/**
 * Canonical artwork themes for AI tagging. Only values from ARTWORK_THEME_OPTIONS
 * are persisted. Unknown labels are dropped (never invented or loosely matched).
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

/** Normalize for lookup: slash spacing, trim bullets/numbers, lowercase. */
export function normalizeThemeKey(s) {
  let t = String(s).trim()
  t = t.replace(/^[\d]+[\).\]]\s*/, '')
  t = t.replace(/^[-*•]\s*/, '')
  t = t.replace(/\s*[/／]\s*/g, ' / ')
  t = t.replace(/\s+/g, ' ')
  t = t.toLowerCase()
  t = t.replace(/[.,;:!?]+$/g, '')
  return t
}

const CANON_BY_NORMALIZED = new Map(
  ARTWORK_THEME_OPTIONS.map((label) => [normalizeThemeKey(label), label]),
)

/**
 * Exact synonyms only (e.g. older prompts / models). Never used to “guess” themes.
 */
const LEGACY_ALIAS_KEYS = new Map([
  [normalizeThemeKey('Everyday Life (Genre)'), 'Everyday Life'],
])

/**
 * Models often return themes as a string, a nested array, or { theme: "..." }.
 * Coerce to a flat list of candidate strings (still need canonical resolution).
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
    return Object.values(o).flatMap((v) => coerceThemesToCandidateStrings(v, depth + 1))
  }

  return []
}

/**
 * Map one model string to a single canonical label, or null if it is not on the list.
 * No fuzzy “best fit”—only normalized exact match to a canonical string or legacy alias.
 */
function resolveToCanonical(raw) {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  let key = normalizeThemeKey(trimmed)
  if (CANON_BY_NORMALIZED.has(key)) return CANON_BY_NORMALIZED.get(key)
  if (LEGACY_ALIAS_KEYS.has(key)) return LEGACY_ALIAS_KEYS.get(key)

  // Same labels with slash or "and" variants only (still must equal a canonical key after normalize)
  const slashy = trimmed.replace(/\s*[/／]\s*/g, ' / ').replace(/\s+and\s+/gi, ' / ')
  key = normalizeThemeKey(slashy)
  if (CANON_BY_NORMALIZED.has(key)) return CANON_BY_NORMALIZED.get(key)
  if (LEGACY_ALIAS_KEYS.has(key)) return LEGACY_ALIAS_KEYS.get(key)

  return null
}

/**
 * Persist only allowed canonical labels; preserve order; dedupe; cap count.
 */
export function normalizeArtworkThemes(raw) {
  const candidates = coerceThemesToCandidateStrings(raw)
  const out = []
  const seen = new Set()
  for (const item of candidates) {
    const canonical = resolveToCanonical(item)
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
Copy each label EXACTLY as written below (spelling, slashes, punctuation). Do not paraphrase or invent labels.

${ARTWORK_THEME_OPTIONS.map((t) => `- ${t}`).join('\n')}

Return "themes" as a JSON array of strings (not a comma-separated string). Example: ["Portrait","Landscape"]
If an idea does not match any label above, omit it—never create a new theme name.
If fewer than ${MAX_THEMES_PER_ARTWORK} labels apply, return fewer.`
