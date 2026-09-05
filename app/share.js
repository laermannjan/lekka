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
export function shareSheet({ id, title, onList, onGive, onRevoke }) {
  const box = element('dialog', 'compose')
  const form = element('form', 'body')
  form.method = 'dialog'

  const heading = element('h2', 'heading', `Share ${title}`)
  heading.id = 'share-title'
  box.setAttribute('aria-labelledby', heading.id)

  const held = element('div', 'list')
  const minted = element('div', 'list')
  minted.hidden = true

  const who = field('Person', 'text', 'a name, or leave empty for a link')
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
    const list = await onList()
    held.replaceChildren(...(list === null ? [] : rows(list, onRevoke, refresh)))
  }

  form.onsubmit = async (event) => {
    event.preventDefault()
    wrong.hidden = true
    if (give.disabled) return
    give.disabled = true

    const name = who.input.value.trim()
    const many = days.input.value.trim()
    const made = await onGive({
      name: name || null,
      scope: scope.value(),
      days: many === '' ? null : Number(many),
    })
    give.disabled = false
    if (made?.error) {
      wrong.textContent = made.error
      wrong.hidden = false
      return
    }

    who.input.value = ''
    days.input.value = ''
    if (made?.token) showToken(minted, id, made.token)
    await refresh()
  }

  form.append(
    heading,
    element('div', 'hint', 'Everyone who holds this recipe, and what they may do with it.'),
    held,
    minted,
    element('div', 'row wide', undefined, [...who.parts]),
    scope.node,
    element('div', 'row wide', undefined, [...days.parts]),
    wrong,
    element('div', 'actions', undefined, [give, done]),
  )
  box.append(form)
  box.onclose = () => box.remove()
  document.body.append(box)
  box.showModal()
  refresh()
  who.input.focus()
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
