import { parseCard, ParseError } from './card.js'
import { renderCard } from './render.js'
import { renderOverview } from './overview.js'
import * as api from './api.js'
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

const CARD = /^\/r\/([^/]+)(?:\/([^/]+))?/
const COLLECTION = /^\/c\/([^/]+)(?:\/([^/]+))?/

start()

async function start() {
  const path = location.pathname
  const card = CARD.exec(path)
  if (card) return showCard(card[1], card[2])

  const found = COLLECTION.exec(path)
  if (found) return showCollection(found[1], found[2])

  return showOverview()
}

async function showOverview() {
  head('lekka', collection()?.id ?? '')
  const held = collection()
  if (!held) return show(bar(), welcome())

  let list = rows()
  let note = null
  try {
    list = await api.readCollection(held.id, held.key)
    setRows(list)
  } catch {
    note = band('Offline. Showing the cards this device remembers.')
  }

  show(
    bar(label('Add'), picker(), label('Collection'), share(held)),
    note,
    renderOverview(await describe(list), { onRemove: (id) => remove(held, list, id) }),
  )
}

async function showCollection(id, key) {
  head('lekka', id)
  const list = await api.readCollection(id, key).catch(() => null)
  if (!list) return fail('No collection under this link.')

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

async function showCard(id, key, scale = 1) {
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
  show(bar(back(), label('Scale'), scales(id, key, scale), keeper(id, key)), scroll)
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
    const next = [...list.filter((row) => row.id !== id), { id, ...(key ? { key } : {}) }]
    await api.writeCollection(held.id, held.key, next)
    setRows(next)
    showCard(id, key)
  }
  return save
}

async function remove(held, list, id) {
  const next = list.filter((row) => row.id !== id)
  await api.writeCollection(held.id, held.key, next)
  setRows(next)
  showOverview()
}

function picker() {
  const input = element('input')
  input.type = 'file'
  input.accept = '.lekka,text/plain'
  input.multiple = true
  input.onchange = async () => {
    const held = collection()
    const next = [...rows()]
    for (const file of input.files) next.push(await api.createCard(await file.text()))
    await api.writeCollection(held.id, held.key, next)
    setRows(next)
    showOverview()
  }
  return input
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
