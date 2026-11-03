import { stepsOf, totalTime } from './recipe.js'
import { search } from './search.js'
import { element, picture } from './ui.js'
import { t } from './i18n.js'

/**
 * Every recipe, by name, with how long it takes and how much it makes. A recipe with a
 * photo shows it; one without shows nothing in its place, since a letter on a colour
 * only says again what the name already says.
 */
export function renderLibrary(entries, { open, photo = () => null, corner = null }) {
  const head = corner
    ? element('div', 'bar', undefined, [element('h1', 'title', t('Recipes')), corner])
    : element('h1', 'title', t('Recipes'))
  if (entries.length === 0)
    return [
      head,
      element('div', 'notice', undefined, [
        element('p', '', t('No recipes yet.')),
        element(
          'p',
          'quiet',
          t('Share a recipe page to lekka with the Add to lekka shortcut, or write one with +.'),
        ),
      ]),
    ]

  const byName = [...entries].sort((a, b) => title(a).localeCompare(title(b), 'de'))
  return [head, element('div', 'group', undefined, byName.map((entry) => row(entry, open, photo)))]
}

/** What answers the query, each recipe once, saying why when its name does not. */
export function renderResults(entries, query, { open, photo = () => null }) {
  if (query.trim() === '') return [element('p', 'hint', t('Names, other names, ingredients and steps.'))]
  const found = search(entries, query)
  if (found.length === 0) return [element('p', 'hint', t('Nothing for “{query}”.', { query: query.trim() }))]
  return [
    element('p', 'hint', found.length === 1 ? t('1 recipe') : t('{n} recipes', { n: found.length })),
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

function row(entry, open, photo, why = null) {
  const shown = photo(entry)
  const link = element('a', shown ? 'item thumbed' : 'item', undefined, [
    shown ? picture(entry.card, 'thumb', shown) : null,
    element('span', 'text', undefined, [
      element('span', 'main', title(entry)),
      why ? element('span', 'sub', why) : about(entry.card),
    ]),
  ])
  link.href = `/r/${entry.id}`
  link.onclick = follow(() => open(entry.id))
  return link
}

/** `15 h 15 min · 10 Portionen`: what decides whether it is the one to cook today. */
function about(card) {
  if (!card) return element('span', 'sub', t('This recipe does not read.'))
  const total = totalTime(stepsOf(card))
  return element('span', 'sub', undefined, [
    total ? element('span', 'time', total) : null,
    total && card.yields ? ' · ' : null,
    card.yields,
  ])
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
