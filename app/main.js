import { parseCard, ParseError } from './card.js'
import { renderCard } from './render.js'

const SCALES = [
  [0.5, '½×'],
  [1, '1×'],
  [1.5, '1½×'],
  [2, '2×'],
]

const title = document.getElementById('title')
const aside = document.getElementById('aside')
const scroll = document.getElementById('scroll')

let card = null
let scale = 1

for (const [factor, text] of SCALES) {
  const button = document.createElement('button')
  button.textContent = text
  button.onclick = () => {
    scale = factor
    show()
  }
  button.dataset.factor = factor
  document.getElementById('scale').append(button)
}

document.getElementById('file').onchange = async (event) => {
  const [file] = event.target.files
  if (file) load(await file.text())
}

function load(text) {
  try {
    card = parseCard(text)
    show()
  } catch (error) {
    if (!(error instanceof ParseError)) throw error
    scroll.replaceChildren(`Line ${error.line}: ${error.message}`)
  }
}

function show() {
  title.textContent = card.title
  aside.textContent = [card.yields, ...card.notes].filter(Boolean).join(' · ')
  scroll.replaceChildren(renderCard(card, scale))
  for (const button of document.getElementById('scale').children)
    button.setAttribute('aria-pressed', Number(button.dataset.factor) === scale)
}

const name = new URLSearchParams(location.search).get('card') ?? 'barbecue-pork-ribs'
const response = await fetch(`../rezepte/${name}.lekka`)
if (response.ok) load(await response.text())
