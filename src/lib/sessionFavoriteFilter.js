/**
 * When a session “favorites” round has submissions, each user who submitted
 * only contributes the artworks they picked (up to 5). Users who did not
 * submit still contribute all of their works that are already in the pool.
 *
 * @param {Array<{ id?: string, user_id?: string }> | null | undefined} artworks
 * @param {Record<string, string[]> | null | undefined} picksByUserId -- userId -> artwork ids (strings)
 */
export function applySessionFavoriteFilter(artworks, picksByUserId) {
  if (!artworks?.length || !picksByUserId || typeof picksByUserId !== 'object') {
    return artworks || []
  }
  const submittedIds = Object.keys(picksByUserId)
  if (submittedIds.length === 0) return artworks

  return artworks.filter((art) => {
    const uid = art.user_id
    if (uid == null || uid === '') return true
    const uidStr = String(uid)
    if (!Object.prototype.hasOwnProperty.call(picksByUserId, uidStr)) return true
    const allowed = picksByUserId[uidStr]
    const idStr = String(art.id)
    return Array.isArray(allowed) && allowed.includes(idStr)
  })
}
