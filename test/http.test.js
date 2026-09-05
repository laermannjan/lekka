import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mkdir, writeFile } from 'node:fs/promises'

import { openDb } from '../server/db.js'
import { openGrants } from '../server/grants.js'
import { openStore } from '../server/store.js'
import { handler } from '../server/http.js'

const CARD = '# Dinkelquarkbrot (1 Kastenbrot)\n\n- backen\n  - Mehl: 300 g\n'

async function serve(options = {}) {
  const where = await mkdtemp(join(tmpdir(), 'lekka-'))
  const db = openDb(join(where, 'lekka.db'))
  const store = await openStore(where, db, openGrants(db)).open()
  const server = createServer(handler(store, options)).listen(0)
  await new Promise((done) => server.once('listening', done))
  const base = `http://localhost:${server.address().port}`

  const call = (path, { key, version, ...rest } = {}) =>
    fetch(base + path, {
      ...rest,
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(version ? { 'if-match': version } : {}),
      },
    })

  return { call, store, close: () => server.close() }
}

test('a card is created, read and written by anyone, since nothing here is owned', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const made = await call('/api/cards', { method: 'POST', body: CARD })
  assert.equal(made.status, 201)
  const { id, key } = await made.json()
  assert.match(id, /^dinkelquarkbrot-[a-z0-9]{10}$/)
  assert.equal(key, undefined, 'a card carries no secret of its own any more')

  const read = await call(`/api/cards/${id}`)
  assert.equal(read.status, 200)
  assert.equal(await read.text(), CARD)

  const written = await call(`/api/cards/${id}`, { method: 'PUT', body: '# B\n' })
  assert.equal(written.status, 204)
  assert.equal(await (await call(`/api/cards/${id}`)).text(), '# B\n')

  const listed = await call('/api/cards')
  assert.deepEqual((await listed.json()).map((row) => row.id), [id], 'and the library is all of them')
})

test('a card that is not there answers the same to every method', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const one = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  const refusals = [
    await call('/api/cards/nothing-at-all'),
    await call('/api/cards/nothing-at-all', { method: 'PUT', body: CARD }),
    await call('/api/cards/nothing-at-all', { method: 'DELETE' }),
    await call('/api/cards/../../etc/passwd'),
  ]

  for (const refusal of refusals) assert.equal(refusal.status, 404)
  assert.equal(await (await call(`/api/cards/${one.id}`)).text(), CARD)
})

test('a card is stored only if it parses', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const refused = await call('/api/cards', { method: 'POST', body: '- no title\n' })
  assert.equal(refused.status, 400)
  assert.match(await refused.text(), /^line 1: /)
})






test('a create token, when set, is required to create but not to read', async (t) => {
  const { call, close } = await serve({ createToken: 'let-me-in' })
  t.after(close)

  assert.equal((await call('/api/cards', { method: 'POST', body: CARD })).status, 401)
  assert.equal((await call('/api/cards', { method: 'POST', body: CARD, key: 'nope' })).status, 401)

  const made = await call('/api/cards', { method: 'POST', body: CARD, key: 'let-me-in' })
  assert.equal(made.status, 201)
  const { id } = await made.json()
  assert.equal((await call(`/api/cards/${id}`)).status, 200)
})

test('a body larger than the limit is refused', async (t) => {
  const { call, close } = await serve({ maxBytes: 64 })
  t.after(close)

  const big = await call('/api/cards', { method: 'POST', body: `# A\n> ${'x'.repeat(200)}\n` })
  assert.equal(big.status, 413)
})

test('the worker is served with a version taken from the app', async (t) => {
  const app = await mkdtemp(join(tmpdir(), 'lekka-app-'))
  await writeFile(join(app, 'sw.js'), "const CACHE = 'lekka-%VERSION%'\n")
  await writeFile(join(app, 'main.js'), 'one\n')

  const { call, close } = await serve({ app })
  t.after(close)

  const first = await (await call('/sw.js')).text()
  const [, digest] = first.match(/lekka-([0-9a-f]{12})/)
  assert.equal(first.includes('%VERSION%'), false)

  assert.equal(await (await call('/sw.js')).text(), first)

  await writeFile(join(app, 'main.js'), 'two\n')
  const second = await (await call('/sw.js')).text()
  assert.notEqual(second.match(/lekka-([0-9a-f]{12})/)[1], digest)
})

test('the page holds no inline script, because the policy would refuse it', async (t) => {
  const app = fileURLToPath(new URL('../app', import.meta.url))
  const { call, close } = await serve({ app })
  t.after(close)

  const page = await call('/')
  const policy = page.headers.get('content-security-policy')
  assert.equal(policy.includes("'unsafe-inline'"), false)

  const html = await page.text()
  const inline = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(
    ([, attributes, source]) => !/\bsrc=/.test(attributes) && source.trim() !== '',
  )
  assert.deepEqual(inline, [])
  assert.match(html, /<script[^>]+src="\/main\.js"/)
})

test('every answer carries the headers that stop a link leaking', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const { headers } = await call('/healthz')
  assert.equal(headers.get('referrer-policy'), 'no-referrer')
  assert.equal(headers.get('x-content-type-options'), 'nosniff')
  assert.match(headers.get('content-security-policy'), /default-src 'self'/)
})

test('a shared card names itself in the head, and is kept out of the index', async (t) => {
  const app = fileURLToPath(new URL('../app', import.meta.url))
  const { call, close } = await serve({ app })
  t.after(close)

  const { id } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  const shared = await call(`/r/${id}`)
  assert.equal(shared.status, 200)
  assert.equal(shared.headers.get('x-robots-tag'), 'noindex')
  const html = await shared.text()
  assert.match(html, /<title>Dinkelquarkbrot<\/title>/)
  assert.match(html, /<meta property="og:title" content="Dinkelquarkbrot" \/>/)

  // The link shape that carried the key in the path is still read, and still unlisted.
  assert.equal((await call(`/r/${id}/anything`)).headers.get('x-robots-tag'), 'noindex')

  // A card that is gone still answers as the app, which is what says so in words.
  const absent = await call('/r/nothing-here')
  assert.equal(absent.status, 200)
  assert.match(await absent.text(), /<title>lekka<\/title>/)

  // The overview is not a shared link and is not held back from anyone.
  const home = await call('/')
  assert.equal(home.headers.get('x-robots-tag'), null)
  assert.match(await home.text(), /<title>lekka<\/title>/)
})

test('a name is written into the head as text, not as markup', async (t) => {
  const app = fileURLToPath(new URL('../app', import.meta.url))
  const { call, close } = await serve({ app })
  t.after(close)

  const title = 'Brot & "Butter" <script>'
  const { id } = await (
    await call('/api/cards', { method: 'POST', body: `# ${title}\n\n- backen\n  - Mehl: 1 g\n` })
  ).json()

  const html = await (await call(`/r/${id}`)).text()
  assert.equal(html.includes('<script>Brot'), false)
  assert.match(html, /<title>Brot &amp; &quot;Butter&quot; &lt;script&gt;<\/title>/)
})

test('creating is rate limited per source, reading is not', async (t) => {
  const { call, close } = await serve({ createsPerHour: 2 })
  t.after(close)

  const made = []
  for (let n = 0; n < 3; n++) made.push(await call('/api/cards', { method: 'POST', body: CARD }))
  assert.deepEqual(
    made.map((response) => response.status),
    [201, 201, 429],
  )

  const { id } = await made[0].json()
  for (let n = 0; n < 5; n++) assert.equal((await call(`/api/cards/${id}`)).status, 200)
})

test('guessing links is rate limited, and a link that works never is', async (t) => {
  const { call, close } = await serve({ triesPerMinute: 3 })
  t.after(close)

  const { id, key } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  for (let n = 0; n < 3; n++) assert.equal((await call(`/api/cards/guess-${n}`)).status, 404)
  assert.equal((await call('/api/cards/guess-again')).status, 429)

  // A wrong key spends the same budget, because the two answer alike and must stay alike.
  assert.equal((await call(`/api/cards/${id}`, { method: 'PUT', body: CARD, key: 'no' })).status, 429)

  const { call: fresh, close: shut } = await serve({ triesPerMinute: 0 })
  t.after(shut)
  const other = await (await fresh('/api/cards', { method: 'POST', body: CARD })).json()
  for (let n = 0; n < 20; n++) assert.equal((await fresh(`/api/cards/miss-${n}`)).status, 404)
  assert.equal((await fresh(`/api/cards/${other.id}`)).status, 200)
})

