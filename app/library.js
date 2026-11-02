import { search } from './search.js'
import { element, icon, picture } from './ui.js'

/** At most this many in `Recently added`, and only once the whole list is longer. */
const RECENT = 6

/**
 * Every recipe, by name. The newest few stand on a shelf above them once there are more
 * than fit on it - in a short library the list already shows all of them, and a shelf
 * would only say the same thing twice.
 */
export function renderLibrary(entries, { open, photo = () => null, corner = null }) {
  const head = corner
    ? element('div', 'bar', undefined, [element('h1', 'title', 'Recipes'), corner])
    : element('h1', 'title', 'Recipes')
  if (entries.length === 0)
    return [
      head,
      element('div', 'notice', undefined, [
        element('p', '', 'No recipes yet.'),
        element(
          'p',
          'quiet',
          'Share a recipe page to lekka with the Add to lekka shortcut, or write one with +.',
        ),
      ]),
    ]

  const parts = [head]

  if (entries.length > RECENT) {
    const newest = [...entries].sort((a, b) => (b.created ?? '').localeCompare(a.created ?? '')).slice(0, RECENT)
    parts.push(
      element('h2', 'heading', 'Recently added'),
      element(
        'div',
        'shelf',
        undefined,
        newest.map((entry) => tile(entry, open, photo)),
      ),
      element('h2', 'heading', 'All recipes'),
    )
  }

  const byName = [...entries].sort((a, b) => title(a).localeCompare(title(b), 'de'))
  parts.push(element('div', 'group', undefined, byName.map((entry) => row(entry, open, photo))))
  return parts
}

/** What answers the query, each recipe once, saying why when its name does not. */
export function renderResults(entries, query, { open, photo = () => null }) {
  if (query.trim() === '') return [element('p', 'hint', 'Names, other names, ingredients and steps.')]
  const found = search(entries, query)
  if (found.length === 0) return [element('p', 'hint', `Nothing for “${query.trim()}”.`)]
  return [
    element('p', 'hint', found.length === 1 ? '1 recipe' : `${found.length} recipes`),
    element(
      'div',
      'group',
      undefined,
      found.map((hit) =>
        row({ id: hit.id, card: hit.card }, open, photo, hit.why ? `${hit.why.label}: ${hit.why.text}` : null),
      ),
    ),
  ]
}

function tile(entry, open, photo) {
  const link = element('a', 'tile', undefined, [
    picture(entry.card, '', photo(entry)),
    element('span', 'main', title(entry)),
    element('span', 'sub', when(entry.created)),
  ])
  link.href = `/r/${entry.id}`
  link.onclick = follow(() => open(entry.id))
  return link
}

function row(entry, open, photo, why = null) {
  const link = element('a', 'item thumbed', undefined, [
    picture(entry.card, 'thumb', photo(entry)),
    element('span', 'text', undefined, [
      element('span', 'main', title(entry)),
      element('span', 'sub', why ?? entry.card?.yields ?? (entry.card ? '' : 'This recipe does not read.')),
    ]),
    element('span', 'chevron', undefined, [icon('chevron', 16)]),
  ])
  link.href = `/r/${entry.id}`
  link.onclick = follow(() => open(entry.id))
  return link
}

function title(entry) {
  return entry.card?.title ?? entry.id
}

/** A link is a link, so it can be opened in a new tab; a plain tap stays in the app. */
function follow(run) {
  return (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    run()
  }
}

/** `Today`, `Yesterday`, `3 days ago`, then the date. */
export function when(iso, now = new Date()) {
  if (!iso) return ''
  const day = (date) => Math.floor((date.getTime() - date.getTimezoneOffset() * 60000) / 86400000)
  const days = day(now) - day(new Date(iso))
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
