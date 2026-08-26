import { parseCard } from './card.js'
import { ids, read, drop } from './library.js'

/** The cards this browser holds. Calls back when one is removed. */
export function renderOverview(onChange) {
  const list = document.createElement('div')
  list.className = 'list'

  const entries = ids()
    .map((id) => ({ id, card: parse(read(id)) }))
    .sort((a, b) => title(a).localeCompare(title(b)))

  if (entries.length === 0) list.append(empty('No cards yet. Add one below.'))
  for (const entry of entries) list.append(cardRow(entry, onChange))
  return list
}

function cardRow({ id, card }, onChange) {
  const line = document.createElement('div')
  line.className = 'row'

  const link = document.createElement('a')
  link.href = `/r/${id}`
  link.className = 'name'
  link.textContent = card ? card.title : id

  const aside = document.createElement('span')
  aside.className = 'aside'
  aside.textContent = card?.yields ?? 'unreadable'

  const remove = document.createElement('button')
  remove.className = 'quiet'
  remove.textContent = 'Remove'
  remove.onclick = () => {
    if (confirm(`Remove ${card ? card.title : id}?`)) {
      drop(id)
      onChange()
    }
  }

  line.append(link, aside, remove)
  return line
}

function empty(text) {
  const line = document.createElement('div')
  line.className = 'row'
  line.textContent = text
  return line
}

function title({ id, card }) {
  return card ? card.title : id
}

function parse(text) {
  try {
    return parseCard(text)
  } catch {
    return null
  }
}
