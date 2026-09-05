import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { mkdir, writeFile } from 'node:fs/promises'

import { openStore } from '../server/store.js'
import { handler } from '../server/http.js'

const CARD = '# Dinkelquarkbrot (1 Kastenbrot)\n\n- backen\n  - Mehl: 300 g\n'

async function serve(options = {}) {
  const store = await openStore(await mkdtemp(join(tmpdir(), 'lekka-'))).open()
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

test('a card is created, read by anyone, written only with its key', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const made = await call('/api/cards', { method: 'POST', body: CARD })
  assert.equal(made.status, 201)
  const { id, key } = await made.json()
  assert.match(id, /^dinkelquarkbrot-[a-z0-9]{10}$/)

  const read = await call(`/api/cards/${id}`)
  assert.equal(read.status, 200)
  assert.equal(await read.text(), CARD)

  const written = await call(`/api/cards/${id}`, { method: 'PUT', body: '# B\n', key })
  assert.equal(written.status, 204)
  assert.equal(await (await call(`/api/cards/${id}`)).text(), '# B\n')
})

test('a wrong key and a missing card answer alike', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const one = await (await call('/api/cards', { method: 'POST', body: CARD })).json()
  const other = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  const refusals = [
    await call(`/api/cards/${one.id}`, { method: 'PUT', body: CARD }),
    await call(`/api/cards/${one.id}`, { method: 'PUT', body: CARD, key: 'wrong' }),
    await call(`/api/cards/${one.id}`, { method: 'PUT', body: CARD, key: other.key }),
    await call(`/api/cards/${one.id}`, { method: 'DELETE', key: other.key }),
    await call('/api/cards/nothing-at-all', { method: 'DELETE', key: one.key }),
    await call('/api/cards/nothing-at-all'),
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

test('there is no way to list', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  await call('/api/cards', { method: 'POST', body: CARD })
  for (const path of ['/api/cards', '/api/cards/', '/api/collections', '/api/'])
    assert.ok([404, 405].includes((await call(path)).status), path)
})

test('a public read of a collection strips every key', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const rows = [{ id: 'brot-aaaaaaaaaa', key: 'secretsecretsecretsec' }, { id: 'salz-bbbbbbbbbb' }]
  const { id, key } = await (
    await call('/api/collections', { method: 'POST', body: JSON.stringify(rows) })
  ).json()
  assert.match(id, /^[a-z]+-[a-z]+-[a-z]+-[a-z0-9]{4}$/)

  const open = await call(`/api/collections/${id}`)
  assert.deepEqual(await open.json(), [{ id: 'brot-aaaaaaaaaa' }, { id: 'salz-bbbbbbbbbb' }])

  const held = await call(`/api/collections/${id}`, { key })
  assert.deepEqual(await held.json(), rows)
})

test('a write must name the version it grew from', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const { id, key } = await (
    await call('/api/collections', { method: 'POST', body: '[]' })
  ).json()

  const read = await call(`/api/collections/${id}`, { key })
  const version = read.headers.get('etag')
  assert.match(version, /^"[0-9a-f]{16}"$/)
  assert.equal((await call(`/api/collections/${id}`)).headers.get('etag'), null)

  const one = [{ id: 'brot-aaaaaaaaaa' }]
  const blind = await call(`/api/collections/${id}`, { method: 'PUT', body: JSON.stringify(one), key })
  assert.equal(blind.status, 428)

  const written = await call(`/api/collections/${id}`, {
    method: 'PUT',
    body: JSON.stringify(one),
    key,
    version,
  })
  assert.equal(written.status, 204)
  assert.notEqual(written.headers.get('etag'), version)

  const stale = await call(`/api/collections/${id}`, {
    method: 'PUT',
    body: JSON.stringify([{ id: 'salz-bbbbbbbbbb' }]),
    key,
    version,
  })
  assert.equal(stale.status, 412)
  assert.deepEqual(await (await call(`/api/collections/${id}`, { key })).json(), one)
})

test('two devices writing from the same version do not both win', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const { id, key } = await (
    await call('/api/collections', { method: 'POST', body: '[]' })
  ).json()
  const version = (await call(`/api/collections/${id}`, { key })).headers.get('etag')

  const write = (row) =>
    call(`/api/collections/${id}`, { method: 'PUT', body: JSON.stringify([row]), key, version })
  const answers = await Promise.all([write({ id: 'brot-aaaaaaaaaa' }), write({ id: 'salz-bbbbbbbbbb' })])

  assert.deepEqual(answers.map((answer) => answer.status).sort(), [204, 412])
  assert.equal((await (await call(`/api/collections/${id}`, { key })).json()).length, 1)
})

test('a collection holds links and nothing else', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const bad = ['{}', '[{"id":"../etc/passwd"}]', '[{"id":"ok-aaaaaaaaaa","key":7}]', '[{}]', 'no']
  for (const body of bad)
    assert.equal((await call('/api/collections', { method: 'POST', body })).status, 400, body)
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

test('a collection longer than the cap is refused', async (t) => {
  const { call, close } = await serve({ maxRows: 2 })
  t.after(close)

  const rows = (count) =>
    JSON.stringify(Array.from({ length: count }, (unused, n) => ({ id: `card-${n}` })))

  assert.equal((await call('/api/collections', { method: 'POST', body: rows(2) })).status, 201)
  assert.equal((await call('/api/collections', { method: 'POST', body: rows(3) })).status, 413)

  const { id, key } = await (
    await call('/api/collections', { method: 'POST', body: rows(1) })
  ).json()
  const grown = await call(`/api/collections/${id}`, {
    method: 'PUT',
    body: rows(3),
    key,
    version: '*',
  })
  assert.equal(grown.status, 413)
})
