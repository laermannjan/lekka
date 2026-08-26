import { parseCard, ParseError } from './card.js'
import { renderCard } from './render.js'
import { renderOverview } from './overview.js'
import * as api from './api.js'
import { editable, wrapInStep } from './source.js'
import { cache, cached, collection, rows, setRows, useCollection } from './library.js'

const SCALES = [
  [0.5, '½×'],
  [1, '1×'],
  [1.5, '1½×'],
  [2, '2×'],
]

const title = document.getElementById('title')
const aside = document.getElementById('aside')
const screen = document.getElementById('screen')

const NEW = `# \n\n- \n  - : \n`
const CARD = /^\/r\/([^/]+)(?:\/([^/]+))?/
const COLLECTION = /^\/c\/([^/]+)(?:\/([^/]+))?/

start()

async function start() {
  const path = location.pathname
  const card = CARD.exec(path)
  if (card) return showCard(card[1], card[2])

  const found = COLLECTION.exec(path)
  if (found) return showCollection(found[1], found[2])

  if (path === '/new') return showWriting()
  return showOverview()
}

async function showOverview() {
  head('lekka', collection()?.id ?? '')
  const held = collection()
  if (!held) return show(bar(), welcome())

  let list = rows()
  let note = null
  try {
    list = (await api.readCollection(held.id, held.key)).rows
    setRows(list)
  } catch {
    note = band('Offline. Showing the cards this device remembers.')
  }

  show(
    bar(writeLink(), label('Collection'), share(held)),
    note,
    renderOverview(await describe(list), {
      onRemove: (id) => remove(held, id),
      onDelete: (id, key, card) => erase(held, id, key, card),
    }),
  )
}

async function showCollection(id, key) {
  head('lekka', id)
  const found = await api.readCollection(id, key).catch(() => null)
  if (!found) return fail('No collection under this link.')
  const list = found.rows

  if (!key)
    return show(
      bar(back()),
      band('Someone else’s collection. You can read these cards, not change them.'),
      renderOverview(await describe(list)),
    )

  useCollection({ id, key })
  setRows(list)
  history.replaceState(null, '', '/')
  return showOverview()
}

async function showCard(id, key, scale = 1, editing = false) {
  const text = await load(id)
  if (text === null) return fail('No card under this link.')

  let card
  try {
    card = parseCard(text)
  } catch (error) {
    if (!(error instanceof ParseError)) throw error
    return fail(`Line ${error.line}: ${error.message}`)
  }

  head(card.title, [card.yields, ...card.notes].filter(Boolean).join(' · '))
  const scroll = element('div', 'scroll')
  scroll.append(renderCard(card, scale))
  show(
    bar(back(), label('Scale'), scales(id, key, scale), keeper(id, key), source(id, key, scale, editing)),
    scroll,
    editing ? panel(id, key, text, scale) : null,
  )
}

function source(id, key, scale, editing) {
  if (!key) return null
  const button = element('button', 'quiet', editing ? 'Close source' : 'Edit source')
  button.onclick = () => showCard(id, key, scale, !editing)
  return button
}

function wrapper(area) {
  const button = element('button', 'quiet', 'Wrap in step')
  button.onclick = () => wrapInStep(area)
  return button
}

function panel(id, key, text, scale) {
  const area = editable(element('textarea', 'source'))
  area.value = text
  area.spellcheck = false

  const message = element('div', 'band warning')
  message.hidden = true

  const save = element('button', 'quiet', 'Save')
  save.onclick = async () => {
    try {
      parseCard(area.value)
    } catch (error) {
      if (!(error instanceof ParseError)) throw error
      message.textContent = `Line ${error.line}: ${error.message}`
      message.hidden = false
      return
    }
    await api.writeCard(id, key, area.value)
    cache(id, area.value)
    showCard(id, key, scale, true)
  }

  const discard = element('button', 'quiet', 'Discard')
  discard.onclick = () => showCard(id, key, scale, true)

  return element('div', 'panel', undefined, [
    bar(label('Source'), save, discard, wrapper(area)),
    message,
    area,
  ])
}

async function load(id) {
  try {
    const text = await api.readCard(id)
    cache(id, text)
    return text
  } catch {
    return cached(id)
  }
}

async function describe(list) {
  return Promise.all(
    list.map(async (row) => {
      const text = await load(row.id)
      try {
        return { ...row, card: text === null ? null : parseCard(text) }
      } catch {
        return { ...row, card: null }
      }
    }),
  )
}

function keeper(id, key) {
  const held = collection()
  if (!held) {
    const create = element('button', 'quiet', 'Save to a new collection')
    create.onclick = async () => {
      const made = await api.createCollection([{ id, ...(key ? { key } : {}) }])
      useCollection(made)
      location.assign('/')
    }
    return create
  }

  const list = rows()
  const found = list.find((row) => row.id === id)
  if (found && (found.key || !key)) return label('In your collection')

  const save = element('button', 'quiet', found ? 'Keep the edit link' : 'Save to collection')
  save.onclick = async () => {
    await change(held, (current) => [
      ...current.filter((row) => row.id !== id),
      { id, ...(key ? { key } : {}) },
    ])
    showCard(id, key)
  }
  return save
}

async function remove(held, id) {
  await change(held, (current) => current.filter((row) => row.id !== id))
  showOverview()
}

/** Removing drops the link. Deleting drops the card, for everyone holding one. */
async function erase(held, id, key, card) {
  const name = card ? card.title : id
  if (!confirm(`Delete ${name} for everyone who has its link?`)) return
  await api.deleteCard(id, key)
  await remove(held, id)
}

/** Read, change, write, and start again if another device wrote in between. */
async function change(held, edit) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { rows: current, version } = await api.readCollection(held.id, held.key)
    const next = edit(current)
    try {
      await api.writeCollection(held.id, held.key, next, version)
      setRows(next)
      return next
    } catch (error) {
      if (error.status !== 412) throw error
    }
  }
  throw new Error('the collection kept changing')
}

function writeLink() {
  const link = element('a', 'name', '+ New card')
  link.href = '/new'
  return link
}

function showWriting() {
  const held = collection()
  head('New card', held ? held.id : '')

  const area = editable(element('textarea', 'source'))
  area.value = NEW
  area.spellcheck = false

  const create = element('button', 'quiet', 'Create')
  create.onclick = async () => {
    try {
      parseCard(area.value)
    } catch (error) {
      return show(
        bar(back(), create, wrapper(area)),
        band(`Line ${error.line}: ${error.message}`, 'warning'),
        area,
      )
    }

    const made = await api.createCard(area.value)
    if (held) await change(held, (current) => [...current, made])
    location.assign(`/r/${made.id}/${made.key}`)
  }

  show(bar(back(), create, wrapper(area)), area)
  area.focus()
}

function welcome() {
  const box = element('div', 'list')
  const line = element('div', 'row')
  const create = element('button', 'quiet', 'Create a collection')
  create.onclick = async () => {
    useCollection(await api.createCollection([]))
    showOverview()
  }
  line.append(create, element('span', 'aside', 'or open the link to one you already have'))
  box.append(line)
  return box
}

function share(held) {
  const link = element('a', 'name', 'Link for another device')
  link.href = `/c/${held.id}/${held.key}`
  return link
}

function head(name, note) {
  title.textContent = name
  aside.textContent = note
}

function fail(message) {
  head('lekka', '')
  show(bar(back()), band(message, 'warning'))
}

function show(...parts) {
  screen.replaceChildren(...parts.filter(Boolean))
}

function band(message, kind = '') {
  return element('div', `band ${kind}`, message)
}

function bar(...parts) {
  return element('div', 'bar', undefined, parts)
}

function label(text) {
  return element('span', 'label', text)
}

function back() {
  const link = element('a', 'name', '← Cards')
  link.href = '/'
  return link
}

function scales(id, key, scale) {
  const group = element('span', 'switch')
  for (const [factor, text] of SCALES) {
    const button = element('button', '', text)
    button.setAttribute('aria-pressed', factor === scale)
    button.onclick = () => showCard(id, key, factor)
    group.append(button)
  }
  return group
}

function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children)
  return node
}
