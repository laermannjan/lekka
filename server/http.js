import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

import { parseCard, ParseError } from '../app/card.js'
import { clear, cookie, COOKIE, encrypted, forged, keep, may, mayCreate } from './access.js'
import { tag } from './store.js'
import { limiter, source } from './limit.js'

const CARD = /^\/api\/cards\/([^/]+)$/
const COLLECTION = /^\/api\/collections\/([^/]+)$/
const SESSION = /^\/api\/sessions\/([a-z0-9]{1,64})$/
const ID = /^[a-z0-9-]{1,64}$/

/** The address a shared recipe is read at, in either shape the app has ever written. */
const READ = /^\/r\/([a-z0-9-]{1,64})(?:\/|$)/

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

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
export function handler(
  store,
  {
    app,
    people = null,
    mode = 'public',
    bootstrap = null,
    createToken = null,
    maxBytes = 65536,
    maxRows = 0,
    createsPerHour = 0,
    triesPerMinute = 0,
    trustProxy = false,
  } = {},
) {
  const limits = {
    creates: limiter({ every: HOUR, most: createsPerHour }),
    tries: limiter({ every: MINUTE, most: triesPerMinute }),
    trustProxy,
  }
  const options = { app, people, mode, bootstrap, createToken, maxBytes, maxRows, limits }

  return async (request, response) => {
    try {
      await route(store, options, request, response)
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

  /* Both answer before anything asks who you are: one is how a supervisor learns the
   * process is up, the other is app code the browser needs to fetch the login screen. */
  if (path === '/healthz') return send(response, 200, 'text/plain', 'ok')
  if (path === '/sw.js') return worker(options.app, response)

  if (forged(request)) throw new Refusal(403, 'cross-site request refused')
  const session = options.people?.session(cookie(request, COOKIE)) ?? null

  if (path.startsWith('/api/session') || path === '/api/me' || path === '/api/people')
    return peopleRoute(options, request, response, path, session)

  /* What this person owns, so a browser they have never signed in on before finds their
   * shelves instead of an empty screen. Only ever their own, and only where there is
   * somebody to be: a public instance has no owners and answers with nothing. */
  if (path === '/api/collections' && request.method === 'GET' && options.people) {
    if (!session) throw new Refusal(401, 'sign in first')
    return json(response, 200, await store.collections.mine(session.person))
  }

  if (path === '/api/cards' || path === '/api/collections') {
    if (request.method !== 'POST') throw new Refusal(405, 'method not allowed')
    if (!mayCreate(options.mode, session)) throw new Refusal(401, 'sign in first')
    allowed(options, request)
    if (!options.limits.creates.charge(who(options, request)))
      throw new Refusal(429, 'too many requests')
    const owner = session?.person ?? null
    return path === '/api/cards'
      ? create(store.cards, response, card(await body(request, options)), owner)
      : create(store.collections, response, rows(await body(request, options), options), owner)
  }

  const asCard = CARD.exec(path)
  if (asCard)
    return guessing(options, request, () =>
      cardRoute(store, options, request, response, asCard[1], key, session),
    )

  const asCollection = COLLECTION.exec(path)
  if (asCollection)
    return guessing(options, request, () =>
      collectionRoute(store, options, request, response, asCollection[1], key, session),
    )

  if (path.startsWith('/api/')) throw missing()
  if (request.method !== 'GET') throw new Refusal(405, 'method not allowed')
  return statics(store, options, path, response, session)
}

/**
 * Signing in, signing out, and the list of browsers that are still signed in. A wrong
 * name and a wrong password answer alike, and both are charged against the same counter
 * that a guessed link is, since both are somebody trying strings.
 */
async function peopleRoute(options, request, response, path, session) {
  const { people, mode, bootstrap } = options
  if (!people) throw missing()
  const secure = encrypted(request, options.limits.trustProxy)

  if (path === '/api/me') {
    if (request.method !== 'GET') throw new Refusal(405, 'method not allowed')
    return json(response, 200, {
      mode,
      empty: people.empty(),
      person: session ? { id: session.person, name: session.name } : null,
      // Named so the device list can say which row is the browser reading it.
      session: session ? { id: session.id, label: session.label } : null,
    })
  }

  /* The first person on an empty instance is admitted by a token the operator reads out
   * of the logs, so that reaching the port first is not the same as owning the box. */
  if (path === '/api/people') {
    if (request.method !== 'POST') throw new Refusal(405, 'method not allowed')
    const { name, password, token } = parse(await body(request, options))
    if (!people.empty()) throw new Refusal(409, 'this instance already has people')
    if (!bootstrap || !same(String(token ?? ''), bootstrap))
      throw new Refusal(401, 'a bootstrap link is required')
    named(name)
    strong(password)
    const person = people.add(name.trim(), password)
    const held = people.mint(person.id, label(request))
    return json(response, 201, { id: person.id, name: person.name }, { 'set-cookie': keep(held, secure) })
  }

  if (path === '/api/sessions') {
    if (request.method === 'GET') {
      if (!session) throw new Refusal(401, 'sign in first')
      return json(response, 200, people.sessions(session.person))
    }
    if (request.method === 'POST') {
      if (!options.limits.tries.charge(who(options, request)))
        throw new Refusal(429, 'too many requests')
      const { name, password } = parse(await body(request, options))
      const person = people.verify(String(name ?? ''), String(password ?? ''))
      if (!person) throw new Refusal(401, 'wrong name or password')
      const held = people.mint(person.id, label(request))
      return json(
        response,
        201,
        { id: person.id, name: person.name },
        { 'set-cookie': keep(held, secure) },
      )
    }
    if (request.method === 'DELETE') {
      people.drop(cookie(request, COOKIE))
      return send(response, 204, null, '', { 'set-cookie': clear(secure) })
    }
    throw new Refusal(405, 'method not allowed')
  }

  const asSession = SESSION.exec(path)
  if (asSession) {
    if (request.method !== 'DELETE') throw new Refusal(405, 'method not allowed')
    if (!session) throw new Refusal(401, 'sign in first')
    if (!people.revoke(session.person, asSession[1])) throw missing()
    return send(response, 204)
  }

  throw missing()
}

function parse(text) {
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch {
    throw new Refusal(400, 'expected an object')
  }
}

function named(name) {
  if (typeof name !== 'string' || name.trim().length < 1 || name.trim().length > 64)
    throw new Refusal(400, 'a name between 1 and 64 characters')
}

/** Long rather than clever: a household picks a passphrase, not a symbol from each class. */
function strong(password) {
  if (typeof password !== 'string' || password.length < 12)
    throw new Refusal(400, 'a password of at least 12 characters')
}

/** The browser names itself, roughly, so a device list has something to show. */
function label(request) {
  const agent = String(request.headers['user-agent'] ?? '')
  for (const [pattern, name] of [
    [/iPhone/, 'an iPhone'],
    [/iPad/, 'an iPad'],
    [/Android/, 'an Android phone'],
    [/Macintosh/, 'a Mac'],
    [/Windows/, 'a Windows PC'],
    [/Linux/, 'a Linux machine'],
  ])
    if (pattern.test(agent)) return name
  return 'a browser'
}

const who = (options, request) => source(request, options.limits.trustProxy)

/** A 404 here is a dead link or a guessed one, and nothing may tell them apart, so both
 * are counted. */
async function guessing(options, request, work) {
  const asker = who(options, request)
  if (options.limits.tries.spent(asker)) throw new Refusal(429, 'too many requests')
  try {
    return await work()
  } catch (error) {
    if (error instanceof Refusal && error.status === 404) options.limits.tries.charge(asker)
    throw error
  }
}

async function cardRoute(store, options, request, response, id, key, session) {
  const { cards } = store
  const { mode } = options
  const owner = await cards.owner(id)
  const held = await cards.verify(id, key)
  /* Your own card opens without its key: the key is how a card is handed to somebody
   * else, not how you reach what you already own. */
  const mine = mode !== 'public' && Boolean(session) && owner !== null && owner === session.person

  if (request.method === 'GET') {
    const text = await cards.read(id)
    if (text === null) throw missing()
    if (!may(mode, session, owner, held)) throw missing()
    await cards.touch(id)
    return send(response, 200, 'text/plain; charset=utf-8', text)
  }

  if (!held && !mine) throw missing()
  if (request.method === 'DELETE') {
    await cards.remove(id)
    return send(response, 204)
  }
  if (request.method !== 'PUT') throw new Refusal(405, 'method not allowed')

  await cards.write(id, card(await body(request, options)).text)
  return send(response, 204)
}

async function collectionRoute(store, options, request, response, id, key, session) {
  const { collections } = store
  const { mode } = options
  const owner = await collections.owner(id)
  const held = await collections.verify(id, key)
  const mine = mode !== 'public' && Boolean(session) && owner !== null && owner === session.person

  if (request.method === 'GET') {
    const text = await collections.read(id)
    if (text === null) throw missing()
    if (!may(mode, session, owner, held)) throw missing()
    await collections.touch(id)
    const list = JSON.parse(text)
    const full = held || mine
    return json(response, 200, full ? list : strip(list), full ? { etag: tag(text) } : {})
  }

  if (!held && !mine) throw missing()
  if (request.method === 'DELETE') {
    await collections.remove(id)
    return send(response, 204)
  }
  if (request.method !== 'PUT') throw new Refusal(405, 'method not allowed')

  const { text } = rows(await body(request, options), options)
  const sent = request.headers['if-match']
  if (!sent) throw new Refusal(428, 'if-match required')

  const answer = collections.swap(id, text, sent)
  if (answer === 'gone') throw missing()
  if (answer === 'changed') throw new Refusal(412, 'the collection has changed')
  return send(response, 204, null, '', { etag: tag(text) })
}

async function create(shelf, response, { text, label }, owner = null) {
  return json(response, 201, await shelf.create(text, label, owner))
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
function rows(text, { maxRows = 0 } = {}) {
  let value
  try {
    value = JSON.parse(text || '[]')
  } catch {
    throw new Refusal(400, 'not json')
  }
  if (!Array.isArray(value)) throw new Refusal(400, 'not a list')
  if (maxRows > 0 && value.length > maxRows) throw new Refusal(413, 'too many rows')

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
async function page(app, response, { title = null, unlisted = false } = {}) {
  const html = await readFile(join(app, 'index.html'), 'utf8')
  const version = await stamp(app)
  send(
    response,
    200,
    TYPES['.html'],
    html
      .replace('%VERSION%', () => version)
      .replace('%HEAD%', () => head(title)),
    unlisted ? { 'x-robots-tag': 'noindex' } : {},
  )
}

/** The worker's cache version is a hash of the app, so a changed file is a new cache. */
async function worker(app, response) {
  if (!app) throw missing()
  const source = await readFile(join(app, 'sw.js'), 'utf8')
  const version = await stamp(app)
  send(response, 200, TYPES['.js'], source.replace('%VERSION%', () => version), {
    'cache-control': 'no-cache',
    'service-worker-allowed': '/',
  })
}

async function stamp(app) {
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

/**
 * The only thing the server renders. An unfurler reads the head and runs no script, and
 * the head is the half of the page that never wants the key. The table stays in the
 * browser, where it is scaled and fitted against a screen this machine cannot see.
 */
function head(title) {
  const name = title ?? 'lekka'
  return [
    `<title>${escaped(name)}</title>`,
    `<meta property="og:title" content="${escaped(name)}" />`,
    `<meta property="og:type" content="${title ? 'article' : 'website'}" />`,
  ].join('\n    ')
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** A recipe is named by whoever wrote it, so its name is text, not markup. */
function escaped(text) {
  return text.replace(/[&<>"]/g, (character) => ESCAPES[character])
}

/** A card that is not there still answers as the app, which is what says so in words. */
async function titleOf(store, id) {
  const text = await store.cards.read(id).catch(() => null)
  if (text === null) return null
  try {
    return parseCard(text).title
  } catch {
    return null
  }
}

async function statics(store, options, path, response, session) {
  const { app, mode } = options
  if (!app) throw missing()
  // The page is stamped, so it is served by the one place that stamps it - by name here,
  // and by falling through below for every address the app answers for itself.
  if (path === '/' || path === '/index.html') return page(app, response)

  // A recipe is unlisted, not public: tags for the chat it was pasted into, `noindex`
  // for the crawler that finds the link in a forum thread. Once there is a door, the
  // title is behind it too - the fragment key never reaches the server, so this markup
  // is the one place a closed instance could still say what a card is called.
  const shared = READ.exec(path)
  if (shared) {
    const open = mode === 'public' || (mode === 'private' && session)
    return page(app, response, {
      title: open ? await titleOf(store, shared[1]) : null,
      unlisted: true,
    })
  }

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
