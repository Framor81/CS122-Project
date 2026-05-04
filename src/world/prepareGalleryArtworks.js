/**
 * Order and optionally subsample session artworks for gallery placement:
 * random subset when over capacity, then round-robin by owner so one person's
 * pieces are less likely to appear back-to-back along the wall-run queue.
 *
 * All steps use deterministic seeded RNG. Inputs are sorted by artwork id first
 * so every client in the session builds the same ordered list (same painting,
 * same wall slot) regardless of Supabase row order.
 */

function sortByArtworkId(arr) {
  return [...arr].sort((a, b) => String(a.id).localeCompare(String(b.id)))
}

function hashString(s) {
  let h = 1779033703
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return h >>> 0
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle(arr, seedStr) {
  const rng = mulberry32(hashString(seedStr))
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * @param {Array<{ id?: string, user_id?: string, imageUrl?: string }>} artworks
 * @param {number} maxSlots from estimateMuseumArtworkCapacity
 * @param {string} seedString session + map seed for stable shuffle per session layout
 */
export function prepareGalleryArtworks(artworks, maxSlots, seedString) {
  const valid = sortByArtworkId((artworks || []).filter((a) => a?.imageUrl && a?.id))
  if (valid.length === 0 || maxSlots <= 0) return []

  let pool = valid
  if (pool.length > maxSlots) {
    pool = seededShuffle(pool, `${seedString}:pick`).slice(0, maxSlots)
  }

  const byUser = new Map()
  for (const art of pool) {
    const uid = art.user_id || 'unknown'
    if (!byUser.has(uid)) byUser.set(uid, [])
    byUser.get(uid).push(art)
  }

  for (const [uid, list] of byUser) {
    byUser.set(uid, seededShuffle(list, `${seedString}:user:${uid}`))
  }

  const owners = seededShuffle([...byUser.keys()], `${seedString}:owners`)

  const out = []
  while (out.length < pool.length) {
    let progressed = false
    for (const uid of owners) {
      const q = byUser.get(uid)
      if (q?.length) {
        out.push(q.shift())
        progressed = true
      }
    }
    if (!progressed) break
  }

  return out
}
