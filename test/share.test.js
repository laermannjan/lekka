import test from 'node:test'
import assert from 'node:assert/strict'

import { install, all, one, tap, byClass } from './dom.js'

const body = install()
globalThis.location = { origin: 'https://kitchen.example' }
// `navigator` is getter-only on the global, so it is defined rather than assigned.
Object.defineProperty(globalThis, 'navigator', {
  value: { clipboard: { writeText: async () => {} } },
  configurable: true,
})
const { shareSheet } = await import('../app/share.js')

const text = (node) => all(node).map((child) => child.own).join(' ')
const inputs = (node) => all(node).filter((child) => child.tag === 'input')
const settle = () => new Promise((done) => setTimeout(done, 0))

/** The panel, and whatever it last asked the server to do. */
async function open(list = [], answer = {}) {
  body.replaceChildren()
  const asked = { gave: [], revoked: [] }
  const box = shareSheet({
    id: 'dinkelquarkbrot-7kmq2rxvbn',
    title: 'Dinkelquarkbrot',
    onList: async () => list,
    onGive: async (what) => {
      asked.gave.push(what)
      return answer
    },
    onRevoke: async (id) => asked.revoked.push(id),
  })
  await settle()
  return { box, asked }
}

test('the panel says who holds the recipe and what each may do', async () => {
  const { box } = await open([
    { id: 'g1', kind: 'person', scope: 'owner', who: 'Jan' },
    { id: 'g2', kind: 'person', scope: 'edit', who: 'Rita' },
    { id: 'g3', kind: 'link', scope: 'read', who: null, expires: '2026-12-24T00:00:00.000Z' },
  ])

  const said = text(box)
  assert.match(said, /Jan owns it/)
  assert.match(said, /Rita may read and change it/)
  assert.match(said, /Anyone with the link may read it · until 2026-12-24/)
})

test('the owner is the one row that cannot be taken back', async () => {
  const { box, asked } = await open([
    { id: 'g1', kind: 'person', scope: 'owner', who: 'Jan' },
    { id: 'g2', kind: 'person', scope: 'read', who: 'Rita' },
  ])

  const drops = all(box).filter(byClass('danger'))
  assert.equal(drops.length, 1, 'only the grant that is not ownership offers Revoke')
  tap(drops[0])
  await settle()
  assert.deepEqual(asked.revoked, ['g2'])
})

test('a name makes a person grant; an empty one makes a link', async () => {
  const { box, asked } = await open()
  const form = one(box, (node) => node.tag === 'form', 'the form')
  const [who, , , days] = inputs(box)

  who.value = '  Rita  '
  days.value = '7'
  await form.onsubmit({ preventDefault: () => {} })
  assert.deepEqual(asked.gave.at(-1), { name: 'Rita', scope: 'read', days: 7 })

  who.value = ''
  days.value = ''
  await form.onsubmit({ preventDefault: () => {} })
  assert.deepEqual(asked.gave.at(-1), { name: null, scope: 'read', days: null }, 'nobody, forever')
})

test('the scope the form offers is read or change, never owning', async () => {
  const { box } = await open()
  const scopes = inputs(box)
    .filter((node) => node.type === 'radio')
    .map((node) => node.value)
  assert.deepEqual(scopes, ['read', 'edit'])
})

test('a minted token is shown once, with the link it belongs to', async () => {
  const { box } = await open([], { kind: 'link', token: 'atokenof22characters22' })
  const form = one(box, (node) => node.tag === 'form', 'the form')

  await form.onsubmit({ preventDefault: () => {} })
  await settle()

  const said = text(box)
  assert.match(said, /once. It is not stored/)
  const link = inputs(box).find((node) => node.readOnly)
  assert.equal(
    link.value,
    'https://kitchen.example/r/dinkelquarkbrot-7kmq2rxvbn#atokenof22characters22',
    'the token rides in the fragment, where no browser sends it',
  )
})

test('a refused share is said in the panel, not swallowed', async () => {
  const { box } = await open([], { error: 'Not shared. Nobody here signs in under that name.' })
  const form = one(box, (node) => node.tag === 'form', 'the form')

  await form.onsubmit({ preventDefault: () => {} })
  await settle()
  assert.match(text(box), /Nobody here signs in under that name/)
})
