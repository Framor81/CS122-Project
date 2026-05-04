const imagePromiseCache = new Map()

export function loadImage(url) {
  const existing = imagePromiseCache.get(url)
  if (existing) return existing
  const promise = (async () => {
    for (const useCors of [true, false]) {
      try {
        return await new Promise((resolve, reject) => {
          const img = new Image()
          if (useCors) img.crossOrigin = 'anonymous'
          img.onload = () => resolve(img)
          img.onerror = () => reject(new Error('image onerror'))
          img.src = url
        })
      } catch (err) {
        if (!useCors) throw err
      }
    }
    throw new Error('image load failed')
  })()
  promise.catch(() => imagePromiseCache.delete(url))
  imagePromiseCache.set(url, promise)
  return promise
}
