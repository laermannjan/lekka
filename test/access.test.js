import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { openDb } from '../server/db.js'
import { openGrants } from '../server/grants.js'
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
  const grants = openGrants(db)
  const store = await openStore(directory, db, grants).open()
  const people = mode === 'NONE' ? null : openPeople(db)
  const server = createServer(
    handler(store, { people, grants, mode, bootstrap: BOOTSTRAP, ...options }),
  ).listen(0)
  await new Promise((done) => server.once('listening', done))
  const base = `http://localhost:${server.address().port}`

  const jar = new Map()
  const call = async (path, { token, as, ...rest } = {}) => {
    const held = as === undefined ? jar.get('one') : as
    const answer = await fetch(base + path, {
      ...rest,
      redirect: 'manual',
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(held ? { cookie: held } : {}),
        ...(rest.method && rest.method !== 'GET' ? { 'x-lekka': '1' } : {}),
        ...rest.headers,
      },
    })
    const set = answer.headers.getSetCookie?.()[0]
    if (set && as === undefined) jar.set('one', set.split(';')[0])
    return answer
  }

  return {
    call,
    grants,
    people,
    cookie: () => jar.get('one'),
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

const cookieOf = (answer) => answer.headers.getSetCookie()[0].split(';')[0]

test('NONE is no access control at all: every recipe, to everyone', async (t) => {
  const { call, close } = await serve('NONE')
  t.after(close)

  const { id } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()
  assert.equal((await call(`/api/cards/${id}`)).status, 200, 'a stranger reads it')
  assert.equal(
    (await call(`/api/cards/${id}`, { method: 'PUT', body: OTHER })).status,
    204,
    'and writes it, with nothing to present',
  )
  assert.deepEqual(
    (await (await call('/api/cards')).json()).map((row) => row.id),
    [id],
    'and the library is the whole server',
  )
  assert.equal((await call('/api/me')).status, 404, 'there is nobody to ask about')
})

test('the first person needs the operator’s link, and only ever once', async (t) => {
  const { call, close } = await serve('AUTH')
  t.after(close)

  const before = await (await call('/api/me')).json()
  assert.equal(before.empty, true)
  assert.equal(before.person, null)
  assert.equal(before.mode, 'AUTH')

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
  assert.equal((await signUp(call, 'Rita')).status, 409, 'the link does not open a second time')
})

test('AUTH is one door with everything shared behind it', async (t) => {
  const { call, people, close } = await serve('AUTH')
  t.after(close)

  assert.equal(
    (await call('/api/cards', { method: 'POST', body: CARD, as: null })).status,
    401,
    'a stranger cannot make one',
  )

  await signUp(call, 'Jan')
  const { id } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  people.add('Rita', 'a different passphrase')
  const hers = cookieOf(await signIn(call, 'Rita', 'a different passphrase'))
  assert.equal((await call(`/api/cards/${id}`, { as: hers })).status, 200, 'Rita reads Jan’s')
  assert.equal(
    (await call(`/api/cards/${id}`, { as: hers, method: 'PUT', body: OTHER })).status,
    204,
    'and writes it, because behind one door nothing is anybody’s',
  )
  assert.deepEqual(
    (await (await call('/api/cards', { as: hers })).json()).map((row) => row.id),
    [id],
    'and the library is the whole server',
  )

  assert.equal((await call(`/api/cards/${id}`, { as: null })).status, 404, 'signed out, nothing')
  const page = await call(`/r/${id}`, { as: null })
  assert.doesNotMatch(await page.text(), /Dinkelquarkbrot/, 'nor does the title leak in markup')
})

test('GRANT gives each recipe an owner, and each person a library of what they hold', async (t) => {
  const { call, grants, people, close } = await serve('GRANT')
  t.after(close)

  await signUp(call, 'Jan')
  const his = cookieOf(await signIn(call))
  const jan = await (await call('/api/cards', { method: 'POST', body: CARD, as: his })).json()

  assert.equal((await call(`/api/cards/${jan.id}`, { as: his })).status, 200, 'the owner reads')
  assert.equal(
    (await call(`/api/cards/${jan.id}`, { as: his, method: 'PUT', body: OTHER })).status,
    204,
    'and writes, with nothing to present',
  )

  people.add('Rita', 'a different passphrase')
  const hers = cookieOf(await signIn(call, 'Rita', 'a different passphrase'))
  assert.equal(
    (await call(`/api/cards/${jan.id}`, { as: hers })).status,
    404,
    'signed in is not the same as invited in',
  )
  assert.deepEqual(await (await call('/api/cards', { as: hers })).json(), [], 'her library is empty')

  // Jan hands her this one recipe, to read and no more.
  const rita = (await (await call('/api/me', { as: hers })).json()).person.id
  grants.give(jan.id, { person: rita, scope: 'read', by: 'jan' })

  assert.equal((await call(`/api/cards/${jan.id}`, { as: hers })).status, 200)
  assert.equal(
    (await call(`/api/cards/${jan.id}`, { as: hers, method: 'PUT', body: CARD })).status,
    404,
    'reading is not writing',
  )
  assert.deepEqual(
    (await (await call('/api/cards', { as: hers })).json()).map((row) => row.id),
    [jan.id],
    'and it appears in her library',
  )
})

test('a link grant opens one recipe for whoever holds the token', async (t) => {
  const { call, grants, close } = await serve('GRANT')
  t.after(close)

  await signUp(call, 'Jan')
  const { id } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()
  const link = grants.give(id, { scope: 'read' })

  assert.equal((await call(`/api/cards/${id}`, { as: null })).status, 404, 'without it, nothing')
  assert.equal(
    (await call(`/api/cards/${id}`, { as: null, token: link.token })).status,
    200,
    'with it, the recipe - and no sign-in needed',
  )
  assert.equal(
    (await call(`/api/cards/${id}`, { as: null, token: link.token, method: 'PUT', body: OTHER }))
      .status,
    404,
    'a read link does not write',
  )

  grants.revoke(link.id)
  assert.equal(
    (await call(`/api/cards/${id}`, { as: null, token: link.token })).status,
    404,
    'and it can be taken back, which a key never could',
  )
})

test('a person sees their own browsers, revokes one, and cannot touch another’s', async (t) => {
  const { call, cookie, close } = await serve('AUTH')
  t.after(close)

  await signUp(call)
  const first = cookie()
  await signIn(call)
  assert.notEqual(first, cookie())

  const open = await (await call('/api/sessions')).json()
  assert.equal(open.length, 2)

  const here = (await (await call('/api/me')).json()).session
  const gone = open.find((row) => row.id !== here.id)
  assert.equal((await call(`/api/sessions/${gone.id}`, { method: 'DELETE' })).status, 204)
  assert.equal((await (await call('/api/sessions')).json()).length, 1)
  assert.equal((await call(`/api/sessions/${gone.id}`, { method: 'DELETE' })).status, 404)
  assert.equal((await call('/api/me')).status, 200, 'the browser doing the revoking stays in')

  assert.equal((await call('/api/sessions', { method: 'DELETE' })).status, 204, 'signing out')
  assert.equal((await (await call('/api/me')).json()).person, null)
})

test('a cookie alone cannot be spent by another site', async (t) => {
  const { call, cookie, close } = await serve('AUTH')
  t.after(close)

  await signUp(call)
  const held = cookie()

  const forged = await call('/api/cards', {
    method: 'POST',
    body: CARD,
    headers: { origin: 'https://evil.example', 'x-lekka': '1' },
  })
  assert.equal(forged.status, 403, 'a foreign origin is refused')

  const bare = await fetch((await call('/api/me')).url.replace('/api/me', '/api/cards'), {
    method: 'POST',
    body: CARD,
    headers: { cookie: held },
  })
  assert.equal(bare.status, 403, 'and so is a request our own page would never make')
})

test('a wrong password answers like a name nobody has, and is rate limited', async (t) => {
  const { call, close } = await serve('AUTH', { triesPerMinute: 3 })
  t.after(close)

  await signUp(call)
  const refusals = []
  for (const body of [
    { name: 'Jan', password: 'wrong wrong wrong' },
    { name: 'Nobody', password: 'a long enough passphrase' },
  ])
    refusals.push(
      await call('/api/sessions', { method: 'POST', body: JSON.stringify(body), as: null }),
    )

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

test('a mode nobody meant to type refuses to start', async () => {
  const { mode } = await import('../server/access.js')
  assert.equal(mode(undefined), 'NONE')
  assert.equal(mode('grant'), 'GRANT', 'the case a person types is the case that works')
  assert.throws(() => mode('public'), /ACCESS_CONTROL/)
})
