import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openDb } from '../server/db.js'
import { openStore } from '../server/store.js'
import { openPeople } from '../server/people.js'
import { handler } from '../server/http.js'

const CARD = '# Dinkelquarkbrot (1 Kastenbrot)\n\n- backen\n  - Mehl: 300 g\n'
const OTHER = '# Erdkruste (1 Brot)\n\n- backen\n  - Mehl: 400 g\n'
const BOOTSTRAP = 'bootstraptokenxyz2345'

/**
 * A whole instance in one mode, with a cookie jar of one, since a browser is what these
 * routes are written for and `fetch` keeps no cookies of its own.
 */
async function serve(mode, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'lekka-'))
  const db = openDb(join(directory, 'lekka.db'))
  const store = await openStore(directory, db).open()
  const people = mode === 'public' ? null : openPeople(db)
  const server = createServer(
    handler(store, { people, mode, bootstrap: BOOTSTRAP, ...options }),
  ).listen(0)
  await new Promise((done) => server.once('listening', done))
  const base = `http://localhost:${server.address().port}`

  const jar = new Map()
  const call = async (path, { key, version, as, ...rest } = {}) => {
    const held = as === undefined ? jar.get('one') : as
    const answer = await fetch(base + path, {
      ...rest,
      redirect: 'manual',
      headers: {
        ...(key ? { authorization: `Bearer ${key}` } : {}),
        ...(version ? { 'if-match': version } : {}),
        ...(held ? { cookie: held } : {}),
        ...(rest.method && rest.method !== 'GET' ? { 'x-lekka': '1' } : {}),
        ...rest.headers,
      },
    })
    const set = answer.headers.getSetCookie?.()[0]
    if (set && as === undefined) jar.set('one', set.split(';')[0])
    return answer
  }

  const cookie = () => jar.get('one')
  return {
    call,
    cookie,
    people,
    close: () => {
      server.close()
      db.close()
    },
  }
}

const signUp = (call, name = 'Jan') =>
  call('/api/people', {
    method: 'POST',
    body: JSON.stringify({ name, password: 'a long enough passphrase', token: BOOTSTRAP }),
  })

const signIn = (call, name = 'Jan', password = 'a long enough passphrase') =>
  call('/api/sessions', { method: 'POST', body: JSON.stringify({ name, password }) })

test('public is the instance as it is today: no door, no people', async (t) => {
  const { call, close } = await serve('public')
  t.after(close)

  const { id, key } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()
  assert.equal((await call(`/api/cards/${id}`)).status, 200, 'a stranger reads it')
  assert.equal(
    (await call(`/api/cards/${id}`, { method: 'PUT', body: OTHER, key })).status,
    204,
    'the key still writes it',
  )
  assert.equal((await call('/api/me')).status, 404, 'there is nobody to ask about')
})

test('the first person needs the operator’s link, and only ever once', async (t) => {
  const { call, close } = await serve('private')
  t.after(close)

  const before = await (await call('/api/me')).json()
  assert.equal(before.empty, true)
  assert.equal(before.person, null)
  assert.equal(before.mode, 'private')

  const wrong = await call('/api/people', {
    method: 'POST',
    body: JSON.stringify({ name: 'Mallory', password: 'a long enough passphrase', token: 'no' }),
  })
  assert.equal(wrong.status, 401, 'reaching the port first is not enough')

  const short = await call('/api/people', {
    method: 'POST',
    body: JSON.stringify({ name: 'Jan', password: 'short', token: BOOTSTRAP }),
  })
  assert.equal(short.status, 400)

  assert.equal((await signUp(call)).status, 201)
  assert.equal((await (await call('/api/me')).json()).person.name, 'Jan')

  const again = await signUp(call, 'Rita')
  assert.equal(again.status, 409, 'the link does not open a second time')
})

test('private puts every card behind the door and shares everything inside it', async (t) => {
  const { call, close } = await serve('private')
  t.after(close)

  const anon = await call('/api/cards', { method: 'POST', body: CARD, as: null })
  assert.equal(anon.status, 401, 'a stranger cannot make one either')

  await signUp(call)
  const { id, key } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  assert.equal((await call(`/api/cards/${id}`)).status, 200)
  assert.equal(
    (await call(`/api/cards/${id}`, { as: null })).status,
    404,
    'signed out, the link alone is worth nothing',
  )
  assert.equal(
    (await call(`/api/cards/${id}`, { as: null, key })).status,
    404,
    'and neither is the key',
  )

  const page = await call(`/r/${id}`, { as: null })
  assert.doesNotMatch(await page.text(), /Dinkelquarkbrot/, 'nor does the title leak in markup')
})

test('secret keeps cards to their owner, and the key is how one is handed on', async (t) => {
  const { call, cookie, people, close } = await serve('secret')
  t.after(close)

  await signUp(call, 'Jan')
  const his = cookie()
  const jan = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  assert.equal((await call(`/api/cards/${jan.id}`)).status, 200, 'the owner needs no key')
  assert.equal(
    (await call(`/api/cards/${jan.id}`, { method: 'PUT', body: OTHER })).status,
    204,
    'and writes without one',
  )

  // Rita is admitted the way the next step will admit her, and signs in for herself.
  people.add('Rita', 'a different passphrase')
  const signedIn = await signIn(call, 'Rita', 'a different passphrase')
  assert.equal(signedIn.status, 201)
  const hers = signedIn.headers.getSetCookie()[0].split(';')[0]

  assert.equal(
    (await call(`/api/cards/${jan.id}`, { as: hers })).status,
    404,
    'signed in is not the same as invited in',
  )
  assert.equal(
    (await call(`/api/cards/${jan.id}`, { as: hers, key: jan.key })).status,
    200,
    'the key is how Jan hands her this one card',
  )
  assert.equal(
    (await call(`/api/cards/${jan.id}`, { as: hers, key: jan.key, method: 'PUT', body: CARD }))
      .status,
    204,
    'and it carries the right to change it, as it always has',
  )

  const mine = await (await call('/api/cards', { method: 'POST', body: CARD, as: hers })).json()
  assert.equal(
    (await call(`/api/cards/${mine.id}`, { as: his })).status,
    404,
    'what Rita makes is hers, and Jan is a stranger to it',
  )
  assert.equal((await call(`/api/cards/${mine.id}`, { as: hers })).status, 200)
})

test('a second browser signed in as the same person finds the library', async (t) => {
  const { call, people, close } = await serve('private')
  t.after(close)

  await signUp(call, 'Jan')
  const made = await (await call('/api/collections', { method: 'POST', body: '[]' })).json()

  // A browser that has never been here: a session, and nothing in local storage.
  const fresh = (await signIn(call)).headers.getSetCookie()[0].split(';')[0]
  const mine = await (await call('/api/collections', { as: fresh })).json()
  assert.deepEqual(
    mine.map((row) => row.id),
    [made.id],
    'the shelf is found without the key that made it',
  )

  assert.equal(
    (await call(`/api/collections/${made.id}`, { as: fresh })).status,
    200,
    'and reads in full',
  )
  const read = await call(`/api/collections/${made.id}`, { as: fresh })
  const written = await call(`/api/collections/${made.id}`, {
    as: fresh,
    method: 'PUT',
    body: JSON.stringify([{ id: 'dinkelquarkbrot-7kmq2rxvbn' }]),
    version: read.headers.get('etag'),
  })
  assert.equal(written.status, 204, 'owning a shelf is the right to write it, key or no key')

  // Somebody else's session sees none of it.
  people.add('Rita', 'a different passphrase')
  const hers = (await signIn(call, 'Rita', 'a different passphrase')).headers
    .getSetCookie()[0]
    .split(';')[0]
  assert.deepEqual(await (await call('/api/collections', { as: hers })).json(), [])
  assert.equal((await call('/api/collections', { as: null })).status, 401)
})

test('a person sees their own browsers, revokes one, and cannot touch another’s', async (t) => {
  const { call, cookie, close } = await serve('private')
  t.after(close)

  await signUp(call)
  const first = cookie()
  await signIn(call)
  const second = cookie()
  assert.notEqual(first, second)

  const open = await (await call('/api/sessions')).json()
  assert.equal(open.length, 2)

  const here = (await (await call('/api/me')).json()).session
  const gone = open.find((row) => row.id !== here.id)
  assert.equal((await call(`/api/sessions/${gone.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await (await call('/api/sessions')).json()).length, 1)
  assert.equal(
    (await call(`/api/sessions/${gone.id}`, { method: 'DELETE' })).status,
    404,
    'revoking it twice changes nothing',
  )
  assert.equal((await call('/api/me')).status, 200, 'the browser doing the revoking stays in')

  assert.equal((await call('/api/sessions', { method: 'DELETE' })).status, 204, 'signing out')
  assert.equal((await (await call('/api/me')).json()).person, null)
})

test('a cookie alone cannot be spent by another site', async (t) => {
  const { call, cookie, close } = await serve('private')
  t.after(close)

  await signUp(call)
  const held = cookie()

  const forged = await call('/api/cards', {
    method: 'POST',
    body: CARD,
    headers: { origin: 'https://evil.example', 'x-lekka': '1' },
  })
  assert.equal(forged.status, 403, 'a foreign origin is refused')

  const bare = await fetch(
    (await call('/api/me')).url.replace('/api/me', '/api/cards'),
    { method: 'POST', body: CARD, headers: { cookie: held } },
  )
  assert.equal(bare.status, 403, 'and so is a request our own page would never make')
})

test('a wrong password answers like a name nobody has, and is rate limited', async (t) => {
  const { call, close } = await serve('private', { triesPerMinute: 3 })
  t.after(close)

  await signUp(call)
  const refusals = []
  for (const body of [
    { name: 'Jan', password: 'wrong wrong wrong' },
    { name: 'Nobody', password: 'a long enough passphrase' },
  ])
    refusals.push(await call('/api/sessions', { method: 'POST', body: JSON.stringify(body), as: null }))

  assert.deepEqual(
    refusals.map((answer) => answer.status),
    [401, 401],
  )
  const texts = await Promise.all(refusals.map((answer) => answer.text()))
  assert.equal(texts[0], texts[1], 'and says the same thing about both')

  await call('/api/sessions', { method: 'POST', body: '{}', as: null })
  const spent = await call('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ name: 'Jan', password: 'wrong' }),
    as: null,
  })
  assert.equal(spent.status, 429, 'guessing runs out')
})
