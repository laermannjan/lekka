import { createHash, timingSafeEqual } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

import { parseCard, ParseError } from '../app/card.js'
import { clear, cookie, COOKIE, encrypted, forged, guarded, keep, may, mayCreate } from './access.js'
import { limiter, source } from './limit.js'

const CARD = /^\/api\/cards\/([^/]+)$/
const SHARE = /^\/api\/cards\/([^/]+)\/grants$/
const GRANT = /^\/api\/grants\/([a-z0-9]{1,64})$/
const SESSION = /^\/api\/sessions\/([a-z0-9]{1,64})$/
const INVITE = /^\/api\/invites\/([a-z0-9]{1,64})$/
const PERSON = /^\/api\/people\/([a-z0-9]{1,64})$/
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
    invites = null,
    grants = null,
    mode = 'NONE',
    bootstrap = null,
    createToken = null,
    maxBytes = 65536,
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
  const options = { app, people, invites, grants, mode, bootstrap, createToken, maxBytes, limits }

  return async (request, response) => {
    try {
      await route(store, options, request, response)
    } catch (error) {
      if (error instanceof Refusal) return send(response, error.status, 'text/plain', error.message)
      // A refusal is expected and says so to the caller. Anything else is a bug, and a
      // 500 with no trace anywhere is a bug nobody can find.
      console.error('lekka:', error)
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

  if (
    path.startsWith('/api/session') ||
    path.startsWith('/api/invite') ||
    path.startsWith('/api/people') ||
    path === '/api/me'
  )
    return peopleRoute(store, options, request, response, path, session)

  if (path === '/api/cards') {
    /* The library. Where nothing is owned everybody sees everything, which is what
     * `NONE` and `LOGIN` mean; under `GRANT` you see what a grant names you on. A library
     * is always somebody's, so unlike a single recipe it is never opened by a token. */
    if (request.method === 'GET') {
      if (options.mode === 'NONE') return json(response, 200, store.all())
      if (!session) throw new Refusal(401, 'sign in first')
      return json(
        response,
        200,
        options.mode === 'GRANT' ? options.grants.cards(session.person) : store.all(),
      )
    }

    if (request.method !== 'POST') throw new Refusal(405, 'method not allowed')
    if (!mayCreate(options.mode, session)) throw new Refusal(401, 'sign in first')
    allowed(options, request)
    if (!options.limits.creates.charge(who(options, request)))
      throw new Refusal(429, 'too many requests')
    return create(store, response, card(await body(request, options)), session?.person ?? null)
  }

  const asShare = SHARE.exec(path)
  if (asShare)
    return guessing(options, request, () =>
      shareRoute(store, options, request, response, asShare[1], session),
    )

  const asGrant = GRANT.exec(path)
  if (asGrant) return grantRoute(options, request, response, asGrant[1], session)

  const asCard = CARD.exec(path)
  if (asCard)
    return guessing(options, request, () =>
      cardRoute(store, options, request, response, asCard[1], key, session),
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
async function peopleRoute(store, options, request, response, path, session) {
  const { people, invites, mode, bootstrap } = options
  if (!people) throw missing()
  const secure = encrypted(request, options.limits.trustProxy)

  if (path === '/api/me') {
    if (request.method !== 'GET') throw new Refusal(405, 'method not allowed')
    return json(response, 200, {
      mode,
      empty: people.empty(),
      person: session
        ? { id: session.person, name: session.name, admin: people.admin(session.person) }
        : null,
      // Named so the device list can say which row is the browser reading it.
      session: session ? { id: session.id, label: session.label } : null,
    })
  }

  /* Made by anybody already inside. There is nothing here for a second browser of your
   * own: signing in is that already. */
  if (path === '/api/invites') {
    if (request.method !== 'POST') throw new Refusal(405, 'method not allowed')
    if (!session) throw new Refusal(401, 'sign in first')
    return json(response, 201, invites.make(session.person))
  }

  /* Everybody here. Any signed-in person may look, because sharing a recipe means
   * picking one of them by name; only the one who keeps the instance may remove. */
  if (path === '/api/people') {
    if (request.method !== 'GET') throw new Refusal(405, 'method not allowed')
    if (!session) throw new Refusal(401, 'sign in first')
    return json(response, 200, people.all())
  }

  const asPerson = PERSON.exec(path)
  if (asPerson) {
    if (request.method !== 'DELETE') throw new Refusal(405, 'method not allowed')
    if (!session || !people.admin(session.person)) throw missing()
    if (asPerson[1] === session.person)
      throw new Refusal(409, 'somebody has to keep the instance; this is you')
    if (!people.person(asPerson[1])) throw missing()
    people.remove(asPerson[1], session.person)
    return send(response, 204)
  }

  const asInvite = INVITE.exec(path)
  if (asInvite) {
    const token = asInvite[1]
    /* The operator's bootstrap link is not a row - it lives in the process, because
     * there is nobody yet to have issued it. It answers here as the person invite it is,
     * so the screen that opens a link never has to know where the link came from. */
    const first = () => Boolean(bootstrap) && people.empty() && same(token, bootstrap)

    if (request.method === 'GET') {
      const found = invites.read(token)
      if (found) return json(response, 200, { who: found.who })
      if (first()) return json(response, 200, { who: null, first: true })
      throw missing()
    }
    if (request.method !== 'POST') throw new Refusal(405, 'method not allowed')
    if (!options.limits.tries.charge(who(options, request)))
      throw new Refusal(429, 'too many requests')

    const starting = first()
    const found = invites.spend(token)
    if (!found && !starting) throw missing()

    const { name, password } = parse(await body(request, options))
    named(name)
    strong(password)
    if (people.named(name.trim())) throw new Refusal(409, 'somebody here already signs in as that')
    const person = people.add(name.trim(), password)

    /* Recipes made before the door went up belong to nobody, and under `GRANT` that
     * means nobody can reach them. The first person to arrive takes them, which is the
     * one moment where an answer is obvious: there is nobody else it could be. */
    if (starting) options.grants.adopt(person.id)

    return json(response, 201, { id: person.id, name: person.name }, cookieFor(people, person, request, secure))
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

/** A person, and the browser they are now signed in on. */
function cookieFor(people, person, request, secure) {
  return { 'set-cookie': keep(people.mint(person.id, label(request)), secure) }
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

/**
 * Who holds a recipe, and handing it to somebody else. Only its owner may look or give:
 * a person granted `edit` may change the recipe, never who else can see it.
 *
 * Refusals are 404, the answer a recipe that is not there gives, so that asking who holds
 * somebody else's card cannot even tell you the card exists.
 */
async function shareRoute(store, options, request, response, id, session) {
  const { mode, grants, people } = options
  if (mode !== 'GRANT') throw missing()
  if (!store.has(id)) throw missing()
  if (!session || !grants.may(id, { person: session.person }, 'owner')) throw missing()

  if (request.method === 'GET') return json(response, 200, grants.on(id))
  if (request.method !== 'POST') throw new Refusal(405, 'method not allowed')

  const { name = null, scope = 'read', days = null } = parse(await body(request, options))
  if (!['read', 'edit'].includes(scope))
    throw new Refusal(400, 'a grant reads or edits; owning is not given away')
  const expires = days === null ? null : expiry(days)

  /* Named, and it is a person: the grant survives the link being forwarded, and taking
   * it back is one row. Unnamed, it is a link: whoever holds the token, until revoked. */
  if (name !== null) {
    const person = people?.named(String(name))
    if (!person) throw new Refusal(404, 'nobody here signs in under that name')
    if (person.id === session.person) throw new Refusal(409, 'you already own this one')
    return json(
      response,
      201,
      grants.give(id, { person: person.id, scope, by: session.person, expires }),
    )
  }

  return json(response, 201, grants.give(id, { scope, by: session.person, expires }))
}

/** Taking one back. Only the owner of the recipe it sits on, and never the owner grant. */
async function grantRoute(options, request, response, id, session) {
  const { mode, grants } = options
  if (mode !== 'GRANT') throw missing()
  if (request.method !== 'DELETE') throw new Refusal(405, 'method not allowed')

  const found = grants.find(id)
  if (!found) throw missing()
  if (!session || !grants.may(found.card, { person: session.person }, 'owner')) throw missing()
  if (found.scope === 'owner')
    throw new Refusal(409, 'a recipe cannot be left with no owner; delete it instead')

  grants.revoke(id)
  return send(response, 204)
}

function expiry(days) {
  const many = Number(days)
  if (!Number.isFinite(many) || many <= 0 || many > 3650)
    throw new Refusal(400, 'an expiry between 1 and 3650 days')
  return new Date(Date.now() + many * 24 * 60 * 60 * 1000).toISOString()
}

async function cardRoute(store, options, request, response, id, token, session) {
  const { mode, grants } = options
  const person = session?.person ?? null

  if (!store.has(id)) throw missing()
  const allowed = (need) => may(mode, session, () => grants.may(id, { person, token }, need))

  if (request.method === 'GET') {
    if (!allowed('read')) throw missing()
    const text = await store.read(id)
    if (text === null) throw missing()
    await store.touch(id)
    return send(response, 200, 'text/plain; charset=utf-8', text)
  }

  if (!allowed('edit')) throw missing()
  if (request.method === 'DELETE') {
    await store.remove(id)
    return send(response, 204)
  }
  if (request.method !== 'PUT') throw new Refusal(405, 'method not allowed')

  await store.write(id, card(await body(request, options)).text)
  return send(response, 204)
}

async function create(store, response, { text, label }, owner = null) {
  return json(response, 201, await store.create(text, label, owner))
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
  const text = await store.read(id).catch(() => null)
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
    const open = mode === 'NONE' || (mode === 'LOGIN' && session)
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
