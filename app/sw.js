// The version is a hash of the app directory, put here by the server.
const CACHE = 'lekka-%VERSION%'

const SHELL = [
  '/',
  '/style.css',
  '/main.js',
  '/api.js',
  '/card.js',
  '/amount.js',
  '/grid.js',
  '/render.js',
  '/overview.js',
  '/library.js',
  '/source.js',
  '/id.js',
  '/manifest.webmanifest',
  '/icon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map(drop)))
      .then(() => self.clients.claim()),
  )
})

/** Network first, always. The cache is a fallback, never a shortcut. */
self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return
  if (new URL(request.url).pathname.startsWith('/api/collections')) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) keep(request, response.clone())
        return response
      })
      .catch(() => fallback(request)),
  )
})

async function fallback(request) {
  const hit = await caches.match(request)
  if (hit) return hit
  if (request.mode === 'navigate') return caches.match('/')
  return Response.error()
}

async function keep(request, response) {
  const cache = await caches.open(CACHE)
  await cache.put(request, response)
}

function drop(name) {
  return caches.delete(name)
}
