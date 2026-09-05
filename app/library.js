const CURRENT = 'lekka:collection'
const KNOWN = 'lekka:collections'
const ROWS = 'lekka:rows:'
const CARD = 'lekka:card:'

const load = (key, fallback) => JSON.parse(localStorage.getItem(key) ?? fallback)
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value))

/** The collection this browser writes to, or null when it holds none. */
export function collection() {
  return load(CURRENT, 'null')
}

export function useCollection(entry) {
  save(CURRENT, entry)
  save(KNOWN, [entry, ...known().filter((other) => other.id !== entry.id)])
}

/**
 * Every collection this device has opened, the one in use first.
 *
 * The list has been kept since the beginning and was never shown. It is what makes a
 * second collection possible without anything on the server changing: a card belongs to
 * no collection, so being in two lists is not a special case, it is the ordinary one.
 *
 * The one in use is folded in rather than assumed to be there, because a device that
 * adopted a collection before this list existed holds a `CURRENT` and no `KNOWN`.
 */
export function known() {
  const held = collection()
  const rest = load(KNOWN, '[]')
  if (!held) return rest
  return [held, ...rest.filter((other) => other.id !== held.id)]
}

export function forget(id) {
  save(KNOWN, load(KNOWN, '[]').filter((other) => other.id !== id))
  if (collection()?.id === id) localStorage.removeItem(CURRENT)
}

/** A copy of what was in a collection, per collection, so switching works with no network. */
export function rows(id) {
  return load(ROWS + id, '[]')
}

export function setRows(id, list) {
  save(ROWS + id, list)
}

/** A copy of every card seen, so a card opens again without a network. */
export function cache(id, text) {
  localStorage.setItem(CARD + id, text)
}

export function cached(id) {
  return localStorage.getItem(CARD + id)
}
