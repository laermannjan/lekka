import test from 'node:test'
import assert from 'node:assert/strict'

import { install, all, one, tap, byClass } from './dom.js'

const body = install()
const { devices, firstPerson, signIn } = await import('../app/door.js')

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

test('the first-person screen carries the operator’s token without showing it', () => {
  const said = []
  const form = firstPerson({ token: 'atokenfromthelog', onCreate: (...args) => said.push(args) })
  body.replaceChildren(form)

  assert.match(text(form), /Nobody has signed in here yet/)
  assert.doesNotMatch(text(form), /atokenfromthelog/, 'the token is spent, never displayed')

  const [name, password] = fields(form)
  assert.equal(password.autocomplete, 'new-password')
  name.value = 'Jan'
  password.value = 'a long enough passphrase'
  submit(form)

  assert.deepEqual(said, [['Jan', 'a long enough passphrase', 'atokenfromthelog']])
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
  const box = devices(list, { id: 'aaa' }, { onRevoke: (id) => revoked.push(id), onSignOut: () => out++ })
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
  const box = devices([], null, { onRevoke: () => {}, onSignOut: () => {} })
  body.replaceChildren(box)
  assert.equal(all(box).filter(byClass('danger')).length, 0)
  assert.match(text(box), /Sign out of this browser/)
})
