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
async function open(list = [], answer = {}, everyone = [{ id: 'rita', name: 'Rita' }]) {
  body.replaceChildren()
  const asked = { gave: [], linked: [], revoked: [] }
  const box = shareSheet({
    id: 'dinkelquarkbrot-7kmq2rxvbn',
    title: 'Dinkelquarkbrot',
    me: 'jan',
    onList: async () => list,
    onPeople: async () => everyone,
    onGive: async (what) => {
      asked.gave.push(what)
      return answer
    },
    onLink: async (what) => {
      asked.linked.push(what)
      return answer
    },
    onRevoke: async (id) => asked.revoked.push(id),
  })
  await settle()
  return { box, asked }
}

const boxes = (node) => inputs(node).filter((child) => child.type === 'checkbox')

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

test('the people to share with are listed, with what each already holds', async () => {
  const { box } = await open(
    [
      { id: 'g1', kind: 'person', scope: 'owner', who: 'Jan' },
      { id: 'g2', kind: 'person', scope: 'edit', who: 'Rita' },
    ],
    {},
    [
      { id: 'jan', name: 'Jan' },
      { id: 'rita', name: 'Rita' },
      { id: 'anna', name: 'Anna' },
    ],
  )

  const offered = boxes(box).map((node) => node.value)
  assert.deepEqual(offered, ['Rita', 'Anna'], 'everybody but you; there is nothing to grant yourself')
  assert.match(text(box), /Rita may read and change it/)
  assert.match(text(box), /Anna holds nothing/)
})

test('choosing people grants each of them, and choosing nobody says so', async () => {
  const { box, asked } = await open([], {}, [
    { id: 'rita', name: 'Rita' },
    { id: 'anna', name: 'Anna' },
  ])
  const form = one(box, (node) => node.tag === 'form', 'the form')
  const days = inputs(box).find((node) => node.type === 'text')

  await form.onsubmit({ preventDefault: () => {} })
  assert.deepEqual(asked.gave, [], 'nothing is granted to nobody')
  assert.match(text(box), /Choose somebody, or make a link instead/)

  for (const node of boxes(box)) node.checked = true
  days.value = '7'
  await form.onsubmit({ preventDefault: () => {} })
  assert.deepEqual(asked.gave, [
    { scope: 'read', days: 7, name: 'Rita' },
    { scope: 'read', days: 7, name: 'Anna' },
  ])
})

test('a link is a separate act, and needs nobody chosen', async () => {
  const { box, asked } = await open([], { kind: 'link', token: 'atokenof22characters22' })
  const link = one(
    box,
    (node) => node.tag === 'button' && node.textContent === 'Make a link instead',
    'the link button',
  )
  assert.equal(link.type, 'button', 'and it does not submit the form by accident')

  tap(link)
  await settle()
  assert.deepEqual(asked.linked, [{ scope: 'read', days: null }])
  assert.match(text(box), /once. It is not stored/)
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
  tap(one(box, (node) => node.tag === 'button' && node.textContent === 'Make a link instead', 'link'))
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
  const { box } = await open([], { error: 'Not shared. The server said 409.' })
  const form = one(box, (node) => node.tag === 'form', 'the form')
  boxes(box)[0].checked = true

  await form.onsubmit({ preventDefault: () => {} })
  await settle()
  assert.match(text(box), /The server said 409/)
})

test('Revoke is a button, not a second way to submit the form', async () => {
  const { box } = await open([
    { id: 'g1', kind: 'person', scope: 'owner', who: 'Jan' },
    { id: 'g2', kind: 'person', scope: 'read', who: 'Rita' },
  ])
  const drop = all(box).filter(byClass('danger'))
  assert.equal(drop.length, 1)
  assert.equal(drop[0].type, 'button', 'without this it minted a link and pressed Share')
})
