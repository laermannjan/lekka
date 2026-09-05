/**
 * The screens an instance with a door needs: signing in, opening a join link, and the
 * list of browsers that are still signed in.
 *
 * They live apart from `main.js` because none of them is about a recipe. Every one is a
 * form and a button, and each hands its answer back rather than deciding what happens
 * next - the router owns that, the way it owns every other screen.
 */
import { linkOut } from './handoff.js'

/** A field with its name beside it, in the same two-column frame a card's notes use. */
function field(name, type, { value = '', hint = null, focus = false } = {}) {
  const input = document.createElement('input')
  input.type = type
  input.value = value
  input.autocomplete = type === 'password' ? 'current-password' : 'username'
  if (hint) input.placeholder = hint
  if (focus) input.autofocus = true
  const label = element('span', 'label', name)
  const box = element('span', 'value', undefined, [input])
  return { input, parts: [label, box] }
}

function form(rows, action, onSubmit, note = null) {
  const box = element('form', 'list')
  const spec = element('div', 'spec', undefined, rows.flatMap((row) => row.parts))
  const button = element('button', 'go', action)
  button.type = 'submit'
  box.append(
    ...[
      note ? element('div', 'band', note) : null,
      spec,
      element('div', 'bar after', undefined, [button]),
    ].filter(Boolean),
  )
  box.onsubmit = (event) => {
    event.preventDefault()
    onSubmit()
  }
  return box
}

/**
 * The sign-in screen. Nothing here says whether the name exists, because the server does
 * not say either - a name nobody has and a wrong password answer alike.
 */
export function signIn({ onSignIn }) {
  const name = field('Name', 'text', { focus: true })
  const password = field('Password', 'password')
  return form([name, password], 'Sign in', () =>
    onSignIn(name.input.value.trim(), password.input.value),
  )
}

/**
 * A join link, opened. The server has already said what it is for, so this screen only
 * has to say it back and take the one thing it still needs.
 *
 * A `device` link needs nothing at all: it was made by the person it belongs to, and
 * only they could have made it, so the link is the whole proof. A `person` link is where
 * somebody new chooses the name and password they will sign in with from then on.
 */
export function joining({ invite, onJoin }) {
  if (invite.kind === 'device') {
    const box = element('form', 'list')
    const add = element('button', 'go', 'Add this browser')
    add.type = 'submit'
    box.append(
      element('div', 'band', `This link adds the browser you are reading it on to ${invite.who}'s recipes. No password needed - it was made from a browser already signed in.`),
      element('div', 'bar after', undefined, [add]),
    )
    box.onsubmit = (event) => {
      event.preventDefault()
      onJoin(null)
    }
    return box
  }

  const name = field('Name', 'text', { hint: 'what to call you', focus: true })
  const password = field('Password', 'password', { hint: 'at least 12 characters' })
  password.input.autocomplete = 'new-password'

  return form(
    [name, password],
    'Join',
    () => onJoin({ name: name.input.value.trim(), password: password.input.value }),
    invite.first
      ? 'Nobody has signed in here yet. This link makes the first person, and then stops working.'
      : `${invite.who} invited you. Pick a name and a password, and they are yours from now on.`,
  )
}

/**
 * Every browser signed in as you, the one reading this named as itself. Signing out ends
 * this browser; revoking ends another, and stops it reading anything new - it does not
 * reach the recipes already on that machine, and the wording says so.
 */
export function devices(list, here, { onRevoke, onSignOut, onInvite }) {
  const box = element('div', 'list')

  for (const row of list) {
    const line = element('div', 'row')
    const mine = row.id === here?.id
    line.append(
      element('span', 'name', mine ? `${row.label} · this one` : row.label),
      element('span', 'aside', `last seen ${when(row.seen)}`),
    )
    if (!mine) {
      const drop = element('button', 'quiet danger', 'Revoke')
      drop.onclick = () => onRevoke(row.id)
      line.append(drop)
    }
    box.append(line)
  }

  const shown = element('div', 'list')
  shown.hidden = true

  /* Two buttons, one flow. What differs is only what redeeming the link does, and that
   * is decided here, by whoever is holding a browser that is already signed in. */
  const another = element('button', 'quiet', 'Add another browser')
  another.onclick = () => hand(shown, onInvite('device'))
  const someone = element('button', 'quiet', 'Invite someone')
  someone.onclick = () => hand(shown, onInvite('person'))

  const out = element('button', 'quiet', 'Sign out of this browser')
  out.onclick = () => onSignOut()

  box.append(
    element('div', 'bar after', undefined, [another, someone, out]),
    shown,
  )
  return box
}

async function hand(box, asked) {
  const made = await asked
  if (!made) return
  const url = new URL(`/join#${made.token}`, location.origin).href
  box.replaceChildren(
    linkOut(
      url,
      made.kind === 'device'
        ? 'Open this on the other browser. It works once, and until it expires.'
        : 'Send this to them. It works once, and until it expires.',
    ),
  )
  box.hidden = false
}

/** Rough on purpose: a device list wants "yesterday", not a timestamp to the second. */
function when(stamp) {
  const days = Math.floor((Date.now() - new Date(stamp).getTime()) / 86400000)
  if (!Number.isFinite(days)) return 'at some point'
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(stamp).toISOString().slice(0, 10)
}

function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children.filter(Boolean))
  return node
}
