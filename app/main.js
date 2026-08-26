import { parseCard, ParseError } from './card.js'
import { renderCard } from './render.js'
import { renderOverview } from './overview.js'
import { read, keep } from './library.js'
import { newId } from './id.js'

const SCALES = [
  [0.5, '½×'],
  [1, '1×'],
  [1.5, '1½×'],
  [2, '2×'],
]

const title = document.getElementById('title')
const aside = document.getElementById('aside')
const screen = document.getElementById('screen')

const route = location.pathname.match(/^\/r\/([^/]+)/)
route ? showCard(route[1]) : showOverview()

function showOverview() {
  title.textContent = 'lekka'
  aside.textContent = ''
  screen.replaceChildren(bar(label('Add'), add()), renderOverview(showOverview))
}

function showCard(id, scale = 1) {
  const text = read(id)
  if (text === null) return fail('No card under this link.')

  let card
  try {
    card = parseCard(text)
  } catch (error) {
    if (!(error instanceof ParseError)) throw error
    return fail(`Line ${error.line}: ${error.message}`)
  }

  title.textContent = card.title
  aside.textContent = [card.yields, ...card.notes].filter(Boolean).join(' · ')

  const scroll = document.createElement('div')
  scroll.className = 'scroll'
  scroll.append(renderCard(card, scale))
  screen.replaceChildren(bar(back(), label('Scale'), scales(id, scale)), scroll)
}

function fail(message) {
  title.textContent = 'lekka'
  aside.textContent = ''
  const band = document.createElement('div')
  band.className = 'band warning'
  band.textContent = message
  screen.replaceChildren(bar(back()), band)
}

function bar(...parts) {
  const element = document.createElement('div')
  element.className = 'bar'
  element.append(...parts)
  return element
}

function label(text) {
  const element = document.createElement('span')
  element.className = 'label'
  element.textContent = text
  return element
}

function back() {
  const link = document.createElement('a')
  link.href = '/'
  link.textContent = '← Cards'
  return link
}

function scales(id, scale) {
  const group = document.createElement('span')
  group.className = 'switch'
  for (const [factor, text] of SCALES) {
    const button = document.createElement('button')
    button.textContent = text
    button.setAttribute('aria-pressed', factor === scale)
    button.onclick = () => showCard(id, factor)
    group.append(button)
  }
  return group
}

function add() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.lekka,text/plain'
  input.multiple = true
  input.onchange = async () => {
    for (const file of input.files) keep(newId(), await file.text())
    showOverview()
  }
  return input
}
