// J2 — ensemble demo service worker.
//
// Strategy:
//   - Cache-first for static assets in /assets/* + /icon-*.png
//   - Network-first (fallthrough to cache) for HTML
//   - Pass-through for /api/* + /ws/* (never cache live data)

const CACHE = 'ensemble-demo-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return

  const isStatic =
    url.pathname.startsWith('/assets/') ||
    /\.(png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(url.pathname)

  if (isStatic) {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit
        return fetch(req).then((res) => {
          if (res.ok) {
            // Clone synchronously: caches.open() is async, and by the
            // time its .then() fires the page may already be consuming
            // res.body, which would lock the stream and make .clone() throw.
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        })
      }),
    )
    return
  }

  if (req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Same clone-before-async race as the static branch above.
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then((hit) => hit ?? caches.match('/'))),
    )
  }
})
