import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openStore } from '../server/store.js'
import { handler } from '../server/http.js'

const CARD = '# Dinkelquarkbrot (1 Kastenbrot)\n\n- backen\n  - Mehl: 300 g\n'

async function serve(options = {}) {
  const store = await openStore(await mkdtemp(join(tmpdir(), 'lekka-'))).open()
  const server = createServer(handler(store, options)).listen(0)
  await new Promise((done) => server.once('listening', done))
  const base = `http://localhost:${server.address().port}`

  const call = (path, { key, ...rest } = {}) =>
    fetch(base + path, {
      ...rest,
      headers: key ? { authorization: `Bearer ${key}` } : {},
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

test('every answer carries the headers that stop a link leaking', async (t) => {
  const { call, close } = await serve()
  t.after(close)

  const { headers } = await call('/healthz')
  assert.equal(headers.get('referrer-policy'), 'no-referrer')
  assert.equal(headers.get('x-content-type-options'), 'nosniff')
  assert.match(headers.get('content-security-policy'), /default-src 'self'/)
})
