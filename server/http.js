import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

import { parseCard, ParseError } from '../app/card.js'

const CARD = /^\/api\/cards\/([^/]+)$/
const COLLECTION = /^\/api\/collections\/([^/]+)$/
const ID = /^[a-z0-9-]{1,64}$/

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

const HEADERS = {
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'content-security-policy':
    "default-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
}

/** A store plus some settings become a request handler. Knows no environment. */
export function handler(store, { app, createToken = null, maxBytes = 65536 } = {}) {
  return async (request, response) => {
    try {
      await route(store, { app, createToken, maxBytes }, request, response)
    } catch (error) {
      if (error instanceof Refusal) return send(response, error.status, 'text/plain', error.message)
      send(response, 500, 'text/plain', 'server error')
    }
  }
}

class Refusal extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** A wrong key and a card that is not there answer the same, so neither can be probed for. */
const missing = () => new Refusal(404, 'not found')

function decode(path) {
  try {
    return decodeURIComponent(path)
  } catch {
    throw new Refusal(400, 'bad path')
  }
}

async function route(store, options, request, response) {
  const path = decode(new URL(request.url, 'http://lekka').pathname)
  const key = bearer(request)

  if (path === '/healthz') return send(response, 200, 'text/plain', 'ok')
  if (path === '/sw.js') return worker(options.app, response)

  if (path === '/api/cards' || path === '/api/collections') {
    if (request.method !== 'POST') throw new Refusal(405, 'method not allowed')
    allowed(options, request)
    return path === '/api/cards'
      ? create(store.cards, response, card(await body(request, options)))
      : create(store.collections, response, rows(await body(request, options)))
  }

  const asCard = CARD.exec(path)
  if (asCard) return cardRoute(store, options, request, response, asCard[1], key)

  const asCollection = COLLECTION.exec(path)
  if (asCollection) return collectionRoute(store, options, request, response, asCollection[1], key)

  if (path.startsWith('/api/')) throw missing()
  if (request.method !== 'GET') throw new Refusal(405, 'method not allowed')
  return statics(options.app, path, response)
}

async function cardRoute(store, options, request, response, id, key) {
  const { cards } = store
  if (request.method === 'GET') {
    const text = await cards.read(id)
    if (text === null) throw missing()
    await cards.touch(id)
    return send(response, 200, 'text/plain; charset=utf-8', text)
  }

  if (!(await cards.verify(id, key))) throw missing()
  if (request.method === 'DELETE') {
    await cards.remove(id)
    return send(response, 204)
  }
  if (request.method !== 'PUT') throw new Refusal(405, 'method not allowed')

  await cards.write(id, card(await body(request, options)).text)
  return send(response, 204)
}

async function collectionRoute(store, options, request, response, id, key) {
  const { collections } = store
  const held = await collections.verify(id, key)

  if (request.method === 'GET') {
    const text = await collections.read(id)
    if (text === null) throw missing()
    await collections.touch(id)
    const list = JSON.parse(text)
    return json(response, 200, held ? list : strip(list), held ? { etag: tag(text) } : {})
  }

  if (!held) throw missing()
  if (request.method === 'DELETE') {
    await collections.remove(id)
    return send(response, 204)
  }
  if (request.method !== 'PUT') throw new Refusal(405, 'method not allowed')

  const { text } = rows(await body(request, options))
  return alone(id, async () => {
    agrees(request, tag(await collections.read(id)))
    await collections.write(id, text)
    return send(response, 204, null, '', { etag: tag(text) })
  })
}

const writing = new Map()

/**
 * Reading the tag, checking it and writing is one move. One process, so a chain per
 * collection is enough: without it both devices read the same tag and both write.
 */
function alone(id, work) {
  const done = (writing.get(id) ?? Promise.resolve()).then(work, work)
  const settled = done.then(
    () => {},
    () => {},
  )
  writing.set(id, settled)
  settled.then(() => {
    if (writing.get(id) === settled) writing.delete(id)
  })
  return done
}

/** A collection is changed from two devices, so a write must name the version it grew from. */
function agrees(request, current) {
  const sent = request.headers['if-match']
  if (!sent) throw new Refusal(428, 'if-match required')
  if (sent !== '*' && sent !== current) throw new Refusal(412, 'the collection has changed')
}

function tag(text) {
  return `"${createHash('sha256').update(text ?? '').digest('hex').slice(0, 16)}"`
}

async function create(shelf, response, { text, label }) {
  return json(response, 201, await shelf.create(text, label))
}

/** A card is stored only if it parses; validation is parsing. */
function card(text) {
  try {
    return { text, label: parseCard(text).title }
  } catch (error) {
    if (!(error instanceof ParseError)) throw error
    throw new Refusal(400, `line ${error.line}: ${error.message}`)
  }
}

/** A collection is a list of links and nothing else. */
function rows(text) {
  let value
  try {
    value = JSON.parse(text || '[]')
  } catch {
    throw new Refusal(400, 'not json')
  }
  if (!Array.isArray(value)) throw new Refusal(400, 'not a list')

  const clean = value.map((row) => {
    if (!ID.test(row?.id ?? '')) throw new Refusal(400, 'a row needs an id')
    if (row.key !== undefined && typeof row.key !== 'string')
      throw new Refusal(400, 'a key is a string')
    return row.key === undefined ? { id: row.id } : { id: row.id, key: row.key }
  })
  return { text: JSON.stringify(clean), label: null }
}

function strip(list) {
  return list.map(({ id }) => ({ id }))
}

function allowed({ createToken }, request) {
  if (createToken && !same(bearer(request) ?? '', createToken))
    throw new Refusal(401, 'token required')
}

function same(a, b) {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}

function bearer(request) {
  const header = request.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
}

async function body(request, { maxBytes }) {
  const chunks = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > maxBytes) throw new Refusal(413, 'too large')
    chunks.push(chunk)
  }
  /** A character can straddle two chunks, so the bytes are decoded together or not at all. */
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * The page, stamped with the same hash the worker caches under.
 *
 * The foot used to carry `v0.1.0`, typed into the file by hand beside a `package.json`
 * that also said 0.1.0 - two places for one fact, and only one of them anybody would
 * think to change. What a person actually wants of that corner is which build they are
 * looking at, which is the question a stale version number cannot answer.
 */
async function page(app, response) {
  const source = await readFile(join(app, 'index.html'), 'utf8')
  send(response, 200, TYPES['.html'], source.replace('%VERSION%', await version(app)))
}

/** The worker's cache version is a hash of the app, so a changed file is a new cache. */
async function worker(app, response) {
  if (!app) throw missing()
  const source = await readFile(join(app, 'sw.js'), 'utf8')
  send(response, 200, TYPES['.js'], source.replace('%VERSION%', await version(app)), {
    'cache-control': 'no-cache',
    'service-worker-allowed': '/',
  })
}

async function version(app) {
  const digest = createHash('sha256')
  await walk(app, '', digest)
  return digest.digest('hex').slice(0, 12)
}

async function walk(root, inside, digest) {
  const entries = await readdir(join(root, inside), { withFileTypes: true })
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(inside, entry.name)
    digest.update(path)
    if (entry.isDirectory()) await walk(root, path, digest)
    else digest.update(await readFile(join(root, path)))
  }
}

async function statics(app, path, response) {
  if (!app) throw missing()
  // The page is stamped, so it is served by the one place that stamps it - by name here,
  // and by falling through below for every address the app answers for itself.
  if (path === '/' || path === '/index.html') return page(app, response)

  const file = join(app, normalize(path))
  if (!file.startsWith(app)) throw new Refusal(403, 'forbidden')

  try {
    return send(response, 200, TYPES[extname(file)] ?? 'application/octet-stream', await readFile(file))
  } catch {
    if (extname(path)) throw missing()
    return page(app, response)
  }
}

function json(response, status, value, extra) {
  send(response, status, 'application/json; charset=utf-8', JSON.stringify(value), extra)
}

function send(response, status, type, body = '', extra = {}) {
  response.writeHead(status, {
    ...HEADERS,
    ...(type ? { 'content-type': type } : {}),
    ...extra,
  })
  response.end(body)
}
