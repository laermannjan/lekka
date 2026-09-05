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
import { openInvites } from '../server/invites.js'
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
  const invites = mode === 'NONE' ? null : openInvites(db)
  const server = createServer(
    handler(store, { people, invites, grants, mode, bootstrap: BOOTSTRAP, ...options }),
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
    db,
    store,
    grants,
    people,
    invites,
    cookie: () => jar.get('one'),
    close: () => {
      server.close()
      db.close()
    },
  }
}

const signUp = (call, name = 'Jan') =>
  call(`/api/invites/${BOOTSTRAP}`, {
    method: 'POST',
    body: JSON.stringify({ name, password: 'a long enough passphrase' }),
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
  const { call, close } = await serve('LOGIN')
  t.after(close)

  const before = await (await call('/api/me')).json()
  assert.equal(before.empty, true)
  assert.equal(before.person, null)
  assert.equal(before.mode, 'LOGIN')

  const wrong = await call('/api/invites/notthelinkatall', {
    method: 'POST',
    body: JSON.stringify({ name: 'Mallory', password: 'a long enough passphrase' }),
  })
  assert.equal(wrong.status, 404, 'reaching the port first is not enough')

  const short = await call(`/api/invites/${BOOTSTRAP}`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Jan', password: 'short' }),
  })
  assert.equal(short.status, 400)

  const asked = await (await call(`/api/invites/${BOOTSTRAP}`)).json()
  assert.deepEqual(asked, { who: null, first: true }, 'the link says what it is')

  assert.equal((await signUp(call)).status, 201)
  assert.equal((await (await call('/api/me')).json()).person.name, 'Jan')
  assert.equal((await signUp(call, 'Rita')).status, 404, 'the link does not open a second time')
})

test('LOGIN is one door with everything shared behind it', async (t) => {
  const { call, people, close } = await serve('LOGIN')
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
  const { call, cookie, close } = await serve('LOGIN')
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
  const { call, cookie, close } = await serve('LOGIN')
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
  const { call, close } = await serve('LOGIN', { triesPerMinute: 3 })
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

test('only the owner may see who holds a recipe, or hand it to anybody', async (t) => {
  const { call, people, close } = await serve('GRANT')
  t.after(close)

  await signUp(call, 'Jan')
  const his = cookieOf(await signIn(call))
  const { id } = await (await call('/api/cards', { method: 'POST', body: CARD, as: his })).json()

  people.add('Rita', 'a different passphrase')
  const hers = cookieOf(await signIn(call, 'Rita', 'a different passphrase'))

  assert.equal((await call(`/api/cards/${id}/grants`, { as: hers })).status, 404)
  assert.equal((await call(`/api/cards/${id}/grants`, { as: null })).status, 404)
  assert.equal(
    (await call(`/api/cards/${id}/grants`, { as: hers, method: 'POST', body: '{"name":"Rita"}' }))
      .status,
    404,
    'and a stranger cannot grant themselves anything',
  )

  const mine = await (await call(`/api/cards/${id}/grants`, { as: his })).json()
  assert.deepEqual(
    mine.map((row) => [row.kind, row.scope, row.who]),
    [['person', 'owner', 'Jan']],
    'the owner grant is a row like any other, and says whose it is',
  )
})

test('a recipe is handed to a person by name, and taken back by one row', async (t) => {
  const { call, people, close } = await serve('GRANT')
  t.after(close)

  await signUp(call, 'Jan')
  const his = cookieOf(await signIn(call))
  const { id } = await (await call('/api/cards', { method: 'POST', body: CARD, as: his })).json()
  people.add('Rita', 'a different passphrase')
  const hers = cookieOf(await signIn(call, 'Rita', 'a different passphrase'))

  const nobody = await call(`/api/cards/${id}/grants`, {
    as: his,
    method: 'POST',
    body: JSON.stringify({ name: 'Mallory', scope: 'read' }),
  })
  assert.equal(nobody.status, 404, 'a name nobody signs in under grants nothing')

  const given = await call(`/api/cards/${id}/grants`, {
    as: his,
    method: 'POST',
    body: JSON.stringify({ name: 'rita', scope: 'edit' }),
  })
  assert.equal(given.status, 201)
  const grant = await given.json()
  assert.equal(grant.kind, 'person')
  assert.equal(grant.token, undefined, 'a person needs no token; she signs in as herself')

  assert.equal(
    (await call(`/api/cards/${id}`, { as: hers, method: 'PUT', body: OTHER })).status,
    204,
    'and she may now change it',
  )

  assert.equal(
    (await call(`/api/grants/${grant.id}`, { as: hers, method: 'DELETE' })).status,
    404,
    'she cannot take back a grant on a recipe that is not hers',
  )
  assert.equal((await call(`/api/grants/${grant.id}`, { as: his, method: 'DELETE' })).status, 204)
  assert.equal((await call(`/api/cards/${id}`, { as: hers })).status, 404, 'and she is out again')
})

test('a link grant comes back once as a token, and the owner grant stays', async (t) => {
  const { call, close } = await serve('GRANT')
  t.after(close)

  await signUp(call, 'Jan')
  const { id } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  const made = await call(`/api/cards/${id}/grants`, {
    method: 'POST',
    body: JSON.stringify({ scope: 'read', days: 7 }),
  })
  assert.equal(made.status, 201)
  const link = await made.json()
  assert.equal(link.kind, 'link')
  assert.equal(link.token.length, 22)
  assert.ok(link.expires > new Date().toISOString())

  assert.equal((await call(`/api/cards/${id}`, { as: null, token: link.token })).status, 200)

  const listed = await (await call(`/api/cards/${id}/grants`)).json()
  assert.equal(listed.length, 2)
  for (const row of listed) assert.equal(row.token, undefined, 'never shown a second time')

  const owner = listed.find((row) => row.scope === 'owner')
  assert.equal((await call(`/api/grants/${owner.id}`, { method: 'DELETE' })).status, 409)
})

test('a grant reads or edits; owning is not something you hand over', async (t) => {
  const { call, close } = await serve('GRANT')
  t.after(close)

  await signUp(call, 'Jan')
  const { id } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  for (const body of [{ scope: 'owner' }, { scope: 'anything' }, { scope: 'read', days: 0 }])
    assert.equal(
      (await call(`/api/cards/${id}/grants`, { method: 'POST', body: JSON.stringify(body) }))
        .status,
      400,
      JSON.stringify(body),
    )
})

test('sharing does not exist where nothing is owned', async (t) => {
  for (const mode of ['NONE', 'LOGIN']) {
    const { call, close } = await serve(mode)
    t.after(close)
    if (mode === 'LOGIN') await signUp(call)
    const { id } = await (await call('/api/cards', { method: 'POST', body: CARD })).json()
    assert.equal((await call(`/api/cards/${id}/grants`)).status, 404, mode)
  }
})

test('an invite makes somebody new, who picks their own name and password', async (t) => {
  const { call, close } = await serve('LOGIN')
  t.after(close)

  await signUp(call, 'Jan')
  const invite = await (await call('/api/invites', { method: 'POST', body: '{}' })).json()
  assert.equal(invite.token.length, 22)

  const said = await (await call(`/api/invites/${invite.token}`, { as: null })).json()
  assert.deepEqual(said, { who: 'Jan' }, 'and says who is asking them in')

  const joined = await call(`/api/invites/${invite.token}`, {
    as: null,
    method: 'POST',
    body: JSON.stringify({ name: 'Rita', password: 'a different passphrase' }),
  })
  assert.equal(joined.status, 201)
  assert.equal((await joined.json()).name, 'Rita')

  const hers = cookieOf(joined)
  assert.equal((await (await call('/api/me', { as: hers })).json()).person.name, 'Rita')
  assert.equal(
    (await (await call('/api/sessions', { as: hers })).json()).length,
    1,
    'her own browser, not a share of his',
  )
  assert.equal(
    (await signIn(call, 'Rita', 'a different passphrase')).status,
    201,
    'and she can sign in again by herself',
  )
})

test('an invite is made only by somebody already inside', async (t) => {
  const { call, close } = await serve('LOGIN')
  t.after(close)

  await signUp(call, 'Jan')
  assert.equal(
    (await call('/api/invites', { as: null, method: 'POST', body: '{}' })).status,
    401,
    'a stranger cannot invite anybody',
  )
})

test('a name somebody already signs in under is refused, not silently merged', async (t) => {
  const { call, close } = await serve('LOGIN')
  t.after(close)

  await signUp(call, 'Jan')
  const invite = await (await call('/api/invites', { method: 'POST', body: '{}' })).json()

  const clash = await call(`/api/invites/${invite.token}`, {
    as: null,
    method: 'POST',
    body: JSON.stringify({ name: 'jan', password: 'a different passphrase' }),
  })
  assert.equal(clash.status, 409)
})

test('an expired invite is worth nothing', async (t) => {
  const { call, invites, people, close } = await serve('LOGIN')
  t.after(close)

  await signUp(call, 'Jan')
  const jan = people.named('Jan')
  const stale = invites.make(jan.id, -1)

  assert.equal((await call(`/api/invites/${stale.token}`, { as: null })).status, 404)
  assert.equal(
    (await call(`/api/invites/${stale.token}`, {
      as: null,
      method: 'POST',
      body: JSON.stringify({ name: 'Rita', password: 'a different passphrase' }),
    })).status,
    404,
  )
})

test('the first person keeps the instance, and nobody after them does', async (t) => {
  const { call, close } = await serve('LOGIN')
  t.after(close)

  await signUp(call, 'Jan')
  assert.equal((await (await call('/api/me')).json()).person.admin, true)

  const invite = await (await call('/api/invites', { method: 'POST', body: '{}' })).json()
  const joined = await call(`/api/invites/${invite.token}`, {
    as: null,
    method: 'POST',
    body: JSON.stringify({ name: 'Rita', password: 'a different passphrase' }),
  })
  const hers = cookieOf(joined)
  assert.equal((await (await call('/api/me', { as: hers })).json()).person.admin, false)

  const everyone = await (await call('/api/people', { as: hers })).json()
  assert.deepEqual(
    everyone.map((row) => [row.name, row.admin]),
    [['Jan', true], ['Rita', false]],
    'anybody signed in may see who is here, since that is who they can share with',
  )
  assert.equal((await call('/api/people', { as: null })).status, 401)

  const rita = everyone.find((row) => row.name === 'Rita')
  assert.equal(
    (await call(`/api/people/${rita.id}`, { as: hers, method: 'DELETE' })).status,
    404,
    'and only the one who keeps the instance may remove anybody',
  )
})

test('removing somebody takes what they were lent and hands on what they owned', async (t) => {
  const { call, grants, close } = await serve('GRANT')
  t.after(close)

  await signUp(call, 'Jan')
  const his = cookieOf(await signIn(call))
  const invite = await (await call('/api/invites', { method: 'POST', body: '{}', as: his })).json()
  const hers = cookieOf(
    await call(`/api/invites/${invite.token}`, {
      as: null,
      method: 'POST',
      body: JSON.stringify({ name: 'Rita', password: 'a different passphrase' }),
    }),
  )

  const jan = (await (await call('/api/me', { as: his })).json()).person
  const rita = (await (await call('/api/me', { as: hers })).json()).person

  const mine = await (await call('/api/cards', { method: 'POST', body: CARD, as: his })).json()
  const hersOwn = await (await call('/api/cards', { method: 'POST', body: OTHER, as: hers })).json()
  // She is lent one of his, and he is lent one of hers.
  grants.give(mine.id, { person: rita.id, scope: 'edit', by: jan.id })
  grants.give(hersOwn.id, { person: jan.id, scope: 'read', by: rita.id })

  assert.equal((await call(`/api/people/${rita.id}`, { as: his, method: 'DELETE' })).status, 204)

  assert.equal(
    (await call(`/api/cards/${hersOwn.id}`, { as: his })).status,
    200,
    'what she owned is his now, rather than unreachable',
  )
  assert.equal(grants.may(hersOwn.id, { person: jan.id }, 'owner'), true)
  assert.equal(
    grants.may(mine.id, { person: rita.id }, 'edit'),
    false,
    'and what she was lent went with her',
  )
  assert.equal((await call('/api/me', { as: hers })).status, 200)
  assert.equal((await (await call('/api/me', { as: hers })).json()).person, null, 'signed out')
})

test('the one who keeps the instance cannot remove themselves', async (t) => {
  const { call, close } = await serve('LOGIN')
  t.after(close)

  await signUp(call, 'Jan')
  const jan = (await (await call('/api/me')).json()).person
  assert.equal((await call(`/api/people/${jan.id}`, { method: 'DELETE' })).status, 409)
  assert.equal((await call('/api/people/nobodyatall', { method: 'DELETE' })).status, 404)
})

test('recipes made before there was a door are taken by the first person in', async (t) => {
  // An instance run open, then closed: the recipes have no owner and, under GRANT,
  // nobody could reach them again unless somebody takes them.
  const { call, close, store, grants } = await serve('GRANT')
  t.after(close)

  // Made with no owner, the way `NONE` makes them, before the mode was changed.
  const before = []
  for (const [body, name] of [[CARD, 'One'], [OTHER, 'Two']])
    before.push((await store.create(body, name)).id)
  assert.deepEqual(grants.on(before[0]), [], 'nobody owns it yet')

  await signUp(call, 'Jan')
  const jan = (await (await call('/api/me')).json()).person

  for (const id of before) assert.equal(grants.may(id, { person: jan.id }, 'owner'), true)
  assert.deepEqual(
    (await (await call('/api/cards')).json()).map((row) => row.id).sort(),
    [...before].sort(),
    'and they are in his library',
  )
})

test('the person who keeps the instance cannot be removed from inside it', async (t) => {
  const { call, people, close } = await serve('LOGIN')
  t.after(close)

  await signUp(call, 'Jan')
  const jan = (await (await call('/api/me')).json()).person
  assert.equal(jan.admin, true)

  const refused = await call(`/api/people/${jan.id}`, { method: 'DELETE' })
  assert.equal(refused.status, 409, 'not by themselves')
  assert.match(await refused.text(), /cannot be removed/)

  // Nor by anybody else, even if a second operator somehow existed to try.
  people.add('Rita', 'a different passphrase')
  const rita = people.named('Rita')
  const hers = cookieOf(await signIn(call, 'Rita', 'a different passphrase'))
  assert.equal(
    (await call(`/api/people/${jan.id}`, { as: hers, method: 'DELETE' })).status,
    404,
    'and somebody who does not keep it cannot remove anybody at all',
  )
  assert.equal(people.person(jan.id).name, 'Jan')
  void rita
})

test('there is one operator, and the database is what says so', async (t) => {
  const { db, people, close } = await serve('LOGIN')
  t.after(close)

  const jan = people.add('Jan', 'a long enough passphrase')
  assert.equal(jan.admin, true)
  const rita = people.add('Rita', 'a different passphrase')
  assert.equal(rita.admin, false, 'the second to arrive is not one')

  // Not a rule the code remembers to apply - a rule the index will not let it break.
  assert.throws(
    () => db.prepare('update people set admin = 1 where id = ?').run(rita.id),
    /UNIQUE|constraint/i,
    'a second operator cannot be written at all',
  )
  assert.equal(people.admin(rita.id), false)
})

test('the operator takes whatever has no owner, however late it appeared', async (t) => {
  const { call, close, store, grants, people } = await serve('GRANT')
  t.after(close)

  await signUp(call, 'Jan')
  const jan = people.operator()
  assert.equal(jan.name, 'Jan')

  const mine = await (await call('/api/cards', { method: 'POST', body: CARD })).json()

  // Written while the door was off, after Jan already existed: the first-person adoption
  // has long since run, so only a boot-time sweep can reach these.
  const orphans = []
  for (const [body, name] of [[CARD, 'One'], [OTHER, 'Two']])
    orphans.push((await store.create(body, name)).id)
  for (const id of orphans) assert.deepEqual(grants.on(id), [], 'nobody owns it yet')

  assert.equal(grants.adopt(jan.id), 2, 'and only the two that had nobody')
  for (const id of orphans) assert.equal(grants.may(id, { person: jan.id }, 'owner'), true)

  assert.equal(grants.adopt(jan.id), 0, 'running again takes nothing, because nothing is left')
  assert.equal(grants.on(mine.id).length, 1, 'and what was already owned is untouched')
})

test('adopting never takes a recipe that somebody else owns', async (t) => {
  const { call, close, grants, people } = await serve('GRANT')
  t.after(close)

  await signUp(call, 'Jan')
  const invite = await (await call('/api/invites', { method: 'POST', body: '{}' })).json()
  const hers = cookieOf(
    await call(`/api/invites/${invite.token}`, {
      as: null,
      method: 'POST',
      body: JSON.stringify({ name: 'Rita', password: 'a different passphrase' }),
    }),
  )
  const hersOwn = await (await call('/api/cards', { method: 'POST', body: CARD, as: hers })).json()
  const rita = people.named('Rita')

  assert.equal(grants.adopt(people.operator().id), 0)
  assert.equal(grants.may(hersOwn.id, { person: rita.id }, 'owner'), true, 'still hers')
})
