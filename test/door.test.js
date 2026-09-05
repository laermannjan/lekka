import test from 'node:test'
import assert from 'node:assert/strict'

import { install, all, one, tap, byClass } from './dom.js'

const body = install()
globalThis.location = { origin: 'https://kitchen.example' }
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => {} } },
  configurable: true,
})
const { devices, household, joining, signIn } = await import('../app/door.js')

const fields = (form) => all(form).filter((node) => node.tag === 'input')
const submit = (form) => form.onsubmit({ preventDefault: () => {} })
const text = (node) => all(node).map((child) => child.own).join(' ')

test('signing in asks two things and hands both back', () => {
  const said = []
  const form = signIn({ onSignIn: (name, password) => said.push([name, password]) })
  body.replaceChildren(form)

  const [name, password] = fields(form)
  assert.equal(name.type, 'text')
  assert.equal(password.type, 'password', 'the password is not on the screen in the clear')
  assert.equal(password.autocomplete, 'current-password')

  name.value = '  Jan  '
  password.value = 'a long enough passphrase'
  submit(form)

  assert.deepEqual(said, [['Jan', 'a long enough passphrase']], 'the name is trimmed, the password is not')
})

test('the first link on an empty instance asks for a name and a password', () => {
  const said = []
  const form = joining({
    invite: { kind: 'person', who: null, first: true },
    onJoin: (who) => said.push(who),
  })
  body.replaceChildren(form)

  assert.match(text(form), /Nobody has signed in here yet/)
  const [name, password] = fields(form)
  assert.equal(password.autocomplete, 'new-password')
  name.value = '  Jan  '
  password.value = 'a long enough passphrase'
  submit(form)

  assert.deepEqual(said, [{ name: 'Jan', password: 'a long enough passphrase' }])
})

test('an invite from somebody says who asked you in', () => {
  const form = joining({ invite: { kind: 'person', who: 'Jan' }, onJoin: () => {} })
  body.replaceChildren(form)
  assert.match(text(form), /Jan invited you/)
  assert.equal(fields(form).length, 2)
})

test('the device list names this browser and refuses to revoke it', () => {
  const now = new Date().toISOString()
  const old = new Date(Date.now() - 3 * 86400000).toISOString()
  const list = [
    { id: 'aaa', label: 'a Mac', created: old, seen: now },
    { id: 'bbb', label: 'an iPhone', created: old, seen: old },
  ]

  const revoked = []
  let out = 0
  const box = devices(
    list,
    { id: 'aaa' },
    { onRevoke: (id) => revoked.push(id), onSignOut: () => out++, onInvite: async () => null },
  )
  body.replaceChildren(box)

  const said = text(box)
  assert.match(said, /a Mac · this one/)
  assert.match(said, /last seen today/)
  assert.match(said, /last seen 3 days ago/)

  const buttons = all(box).filter(byClass('danger'))
  assert.equal(buttons.length, 1, 'only the other browser offers Revoke')
  tap(buttons[0])
  assert.deepEqual(revoked, ['bbb'])

  const signOut = one(
    box,
    (node) => node.tag === 'button' && node.textContent === 'Sign out of this browser',
    'the sign-out button',
  )
  tap(signOut)
  assert.equal(out, 1)
})

test('a browser that is not in the list yet still gets a sign-out', () => {
  const box = devices([], null, { onRevoke: () => {}, onSignOut: () => {}, onInvite: async () => null })
  body.replaceChildren(box)
  assert.equal(all(box).filter(byClass('danger')).length, 0)
  assert.match(text(box), /Sign out of this browser/)
})

test('inviting somebody hands you a link, once', async () => {
  let asked = 0
  const box = devices([], null, {
    onRevoke: () => {},
    onSignOut: () => {},
    onInvite: async () => {
      asked++
      return { token: 'atokenof22characters22' }
    },
  })
  body.replaceChildren(box)

  assert.equal(
    all(box).filter((node) => node.tag === 'button' && node.textContent === 'Add another browser')
      .length,
    0,
    'there is no second-browser invite: signing in is that already',
  )

  tap(one(box, (node) => node.tag === 'button' && node.textContent === 'Invite someone', 'invite'))
  await new Promise((done) => setTimeout(done, 0))
  assert.equal(asked, 1)
  assert.match(text(box), /Send this to them/)
  const shown = fields(box).find((node) => node.readOnly)
  assert.equal(shown.value, 'https://kitchen.example/join#atokenof22characters22')
})

test('the household screen removes anybody but you, and says what that costs', () => {
  const removed = []
  const box = household(
    [
      { id: 'jan', name: 'Jan', admin: true, seen: new Date().toISOString() },
      { id: 'rita', name: 'Rita', admin: false, seen: null },
    ],
    'jan',
    { onRemove: (person) => removed.push(person.id) },
  )
  body.replaceChildren(box)

  assert.match(text(box), /Jan · you/)
  assert.match(text(box), /keeps this instance/)
  assert.match(text(box), /last seen never/, 'somebody who has never signed in says so')

  const drops = all(box).filter(byClass('danger'))
  assert.equal(drops.length, 1, 'you are not on the list of people you can remove')
  tap(drops[0])
  assert.deepEqual(removed, ['rita'])
})
