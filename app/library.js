const CURRENT = 'lekka:collection'
const KNOWN = 'lekka:collections'
const ROWS = 'lekka:rows'
const CARD = 'lekka:card:'
const PRINT = 'lekka:print'

const load = (key, fallback) => JSON.parse(localStorage.getItem(key) ?? fallback)
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value))

/** The collection this browser writes to, or null when it holds none. */
export function collection() {
  return load(CURRENT, 'null')
}

export function useCollection(entry) {
  save(CURRENT, entry)
  save(KNOWN, [entry, ...known().filter((other) => other.id !== entry.id)])
  save(ROWS, [])
}

export function known() {
  return load(KNOWN, '[]')
}

export function rows() {
  return load(ROWS, '[]')
}

export function setRows(list) {
  save(ROWS, list)
}

/** A copy of every card seen, so a card opens again without a network. */
export function cache(id, text) {
  localStorage.setItem(CARD + id, text)
}

export function cached(id) {
  return localStorage.getItem(CARD + id)
}

/**
 * Whether this browser prints a card in small type. A preference of the device and not
 * of the card: it says nothing about the recipe and nothing a link should carry, so it
 * lives here beside the collection rather than in the state a card is drawn from.
 */
export function smallPrint() {
  return load(PRINT, 'false')
}

export function setSmallPrint(small) {
  save(PRINT, small)
}
