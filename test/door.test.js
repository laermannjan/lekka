import test from 'node:test'
import assert from 'node:assert/strict'

import { install, all, one, tap, byClass } from './dom.js'

const body = install()
globalThis.location = { origin: 'https://kitchen.example' }
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => {} } },
  configurable: true,
})
const { devices, joining, signIn } = await import('../app/door.js')

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

test('a device link asks for nothing at all, because the link is the proof', () => {
  const said = []
  const form = joining({ invite: { kind: 'device', who: 'Jan' }, onJoin: (who) => said.push(who) })
  body.replaceChildren(form)

  assert.match(text(form), /adds the browser you are reading it on to Jan's recipes/)
  assert.match(text(form), /No password needed/)
  assert.equal(fields(form).length, 0, 'no name, no password')

  submit(form)
  assert.deepEqual(said, [null])
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

test('the two invites differ only in what the link will do', async () => {
  const asked = []
  const box = devices([], null, {
    onRevoke: () => {},
    onSignOut: () => {},
    onInvite: async (kind) => {
      asked.push(kind)
      return { kind, token: 'atokenof22characters22' }
    },
  })
  body.replaceChildren(box)

  const button = (label) =>
    one(box, (node) => node.tag === 'button' && node.textContent === label, label)

  tap(button('Add another browser'))
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(asked, ['device'])
  assert.match(text(box), /Open this on the other browser/)
  const shown = fields(box).find((node) => node.readOnly)
  assert.equal(
    shown.value,
    'https://kitchen.example/join#atokenof22characters22',
    'the token rides in the fragment, where no browser sends it',
  )

  tap(button('Invite someone'))
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(asked, ['device', 'person'])
  assert.match(text(box), /Send this to them/)
})
