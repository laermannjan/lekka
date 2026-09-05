import { linkOut } from './handoff.js'
import { address } from './link.js'

/**
 * Who holds this recipe, and handing it to somebody else.
 *
 * It is one dialog rather than a screen, because sharing is something you do *to* the
 * recipe you are looking at and then stop doing. Two ways to give, and they are different
 * things rather than two spellings of one: naming a person makes a grant that survives
 * the link being forwarded and is taken back in one act; naming nobody mints a link,
 * which is whoever holds it until it expires or is revoked.
 *
 * A token is shown once, at the moment it is made, and never again - the server keeps
 * only its hash, so there is nothing to show later even if the panel wanted to.
 */
export function shareSheet({ id, title, me, onList, onPeople, onGive, onLink, onRevoke }) {
  const box = element('dialog', 'compose')
  const form = element('form', 'body')
  form.method = 'dialog'

  const heading = element('h2', 'heading', `Share ${title}`)
  heading.id = 'share-title'
  box.setAttribute('aria-labelledby', heading.id)

  const held = element('div', 'list')
  const minted = element('div', 'list')
  minted.hidden = true

  const who = people()
  const scope = choose('They may', [
    ['read', 'Read it'],
    ['edit', 'Read and change it'],
  ])
  const days = field('Expires', 'text', 'days, or leave empty for never')

  const wrong = element('span', 'hint warn')
  wrong.hidden = true

  const give = element('button', 'go', 'Share')
  give.type = 'submit'
  const done = element('button', 'quiet', 'Done')
  done.type = 'button'
  done.onclick = () => box.close()

  const refresh = async () => {
    const [list, everyone] = await Promise.all([onList(), onPeople()])
    held.replaceChildren(...(list === null ? [] : rows(list, onRevoke, refresh)))
    // Everyone but you, each saying what they already hold, so choosing one of them is
    // a decision made with the answer in front of you rather than from memory.
    who.fill(
      (everyone ?? []).filter((person) => person.id !== me),
      list ?? [],
    )
  }

  form.onsubmit = async (event) => {
    event.preventDefault()
    wrong.hidden = true
    if (give.disabled) return
    give.disabled = true

    const chosen = who.chosen()
    const many = days.input.value.trim()
    const asked = { scope: scope.value(), days: many === '' ? null : Number(many) }

    if (chosen.length === 0) {
      wrong.textContent = 'Choose somebody, or make a link instead.'
      wrong.hidden = false
      give.disabled = false
      return
    }

    // One act, however many people are in it: granting somebody who already holds
    // something changes what they hold rather than adding a second row.
    for (const name of chosen) {
      const made = await onGive({ ...asked, name })
      if (made?.error) {
        wrong.textContent = made.error
        wrong.hidden = false
        break
      }
    }

    give.disabled = false
    days.input.value = ''
    await refresh()
  }

  const link = element('button', 'quiet', 'Make a link instead')
  link.type = 'button'
  link.onclick = async () => {
    const many = days.input.value.trim()
    const made = await onLink({ scope: scope.value(), days: many === '' ? null : Number(many) })
    if (made?.error) {
      wrong.textContent = made.error
      wrong.hidden = false
      return
    }
    if (made?.token) showToken(minted, id, made.token)
    await refresh()
  }

  form.append(
    heading,
    element('div', 'hint', 'Everyone who holds this recipe, and what they may do with it.'),
    held,
    minted,
    who.node,
    scope.node,
    element('div', 'row wide', undefined, [...days.parts]),
    wrong,
    element('div', 'actions', undefined, [give, link, done]),
  )
  box.append(form)
  box.onclose = () => box.remove()
  document.body.append(box)
  box.showModal()
  refresh()
  return box
}

function rows(list, onRevoke, refresh) {
  if (list.length === 0) return [element('div', 'row', 'Nobody yet.')]

  return list.map((grant) => {
    const line = element('div', 'row')
    line.append(
      element('span', 'name', grant.who ?? 'Anyone with the link'),
      element('span', 'aside', says(grant)),
    )
    // The owner is on the list because it is a grant like any other, but it is the one
    // row that cannot go: a recipe with no owner is one nobody could ever reach again.
    if (grant.scope !== 'owner') {
      const drop = element('button', 'quiet danger', 'Revoke')
      // Inside a form, a button with no type submits it. Without this, Revoke minted a
      // link and left Share looking pressed.
      drop.type = 'button'
      drop.onclick = async () => {
        await onRevoke(grant.id)
        await refresh()
      }
      line.append(drop)
    }
    return line
  })
}

function says(grant) {
  const what = { owner: 'owns it', edit: 'may read and change it', read: 'may read it' }[grant.scope]
  if (!grant.expires) return what
  return `${what} · until ${grant.expires.slice(0, 10)}`
}

/** The one moment the token exists in a form anybody can copy. */
function showToken(box, id, token) {
  const url = new URL(address(id, token), location.origin).href
  box.replaceChildren(
    linkOut(url, 'This link, once. It is not stored, so it cannot be shown again.'),
  )
  box.hidden = false
}

/**
 * Everybody else here, each with a box and what they already hold beside their name.
 *
 * It was a field you typed a name into, which asked you to remember both who is here
 * and what you had already given them. Neither is a thing to remember when the server
 * knows both.
 */
function people() {
  const list = element('div', 'list')
  const node = element('div', 'row wide', undefined, [element('span', 'name', 'Share with'), list])
  const held = []

  return {
    node,
    fill(everyone, grants) {
      held.length = 0
      if (everyone.length === 0) {
        list.replaceChildren(element('div', 'row', 'Nobody else here yet. Invite somebody first.'))
        return
      }
      const has = new Map(grants.filter((one) => one.who).map((one) => [one.who, one.scope]))
      list.replaceChildren(
        ...everyone.map((person) => {
          const box = element('input')
          box.type = 'checkbox'
          box.value = person.name
          const now = has.get(person.name)
          const line = element('label', 'choice', undefined, [
            box,
            element('span', 'what', person.name),
            element('span', 'aside', now ? says({ scope: now }) : 'holds nothing'),
          ])
          held.push(box)
          return line
        }),
      )
    },
    chosen() {
      return held.filter((box) => box.checked).map((box) => box.value)
    },
  }
}

function field(name, type, hint) {
  const input = element('input')
  input.type = type
  input.value = ''
  input.placeholder = hint
  const label = element('span', 'name', name)
  return { input, parts: [label, input] }
}

function choose(name, options) {
  const node = element('div', 'row wide')
  const inputs = element('div', 'inputs')
  const held = []
  for (const [value, text] of options) {
    const input = element('input')
    input.type = 'radio'
    input.name = 'scope'
    input.value = value
    if (held.length === 0) input.checked = true
    const choice = element('label', 'choice', undefined, [input, element('span', 'what', text)])
    inputs.append(choice)
    held.push(input)
  }
  node.append(element('span', 'name', name), inputs)
  return { node, value: () => held.find((one) => one.checked)?.value ?? 'read' }
}

function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children.filter(Boolean))
  return node
}
