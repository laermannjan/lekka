import { formatAmount } from './amount.js'
import { aboutOf, stepsOf } from './recipe.js'

/**
 * Recipes that answer a query, each once, with the best reason it answers: its name, then
 * another name it goes by, then an ingredient, then something a step says. Letters are
 * compared without case or accents, so `kase` finds `Käsekuchen`.
 *
 * `entries` are `{ id, card }`; a recipe that did not parse has no card and is skipped.
 */
export function search(entries, query) {
  const wanted = fold(query.trim())
  if (wanted === '') return []
  const found = []
  for (const { id, card } of entries) {
    if (!card) continue
    const reason = reasonFor(card, wanted)
    if (reason) found.push({ id, card, ...reason })
  }
  return found.sort((a, b) => a.rank - b.rank || a.card.title.localeCompare(b.card.title))
}

function reasonFor(card, wanted) {
  const has = (text) => text != null && fold(text).includes(wanted)
  if (has(card.title)) return { rank: fold(card.title).startsWith(wanted) ? 0 : 1, why: null }

  const alias = aboutOf(card).aliases.find(has)
  if (alias) return { rank: 2, why: { label: 'Also known as', text: alias } }

  const steps = stepsOf(card)
  for (const step of steps)
    for (const ingredient of step.ingredients)
      if (has(ingredient.name) || has(ingredient.aside)) {
        const amount = formatAmount(ingredient.amount)
        return { rank: 3, why: { label: 'Ingredient', text: amount ? `${ingredient.name}, ${amount}` : ingredient.name } }
      }

  const step = steps.find((one) => has(one.title) || has(one.aside))
  if (step)
    return { rank: 4, why: { label: `Step ${step.n}`, text: step.aside ? `${step.title}, ${step.aside}` : step.title } }

  return null
}

/** Lower case, accents gone, `ß` as `ss`: how a hurried search is typed. */
export function fold(text) {
  return text.toLocaleLowerCase('de').normalize('NFD').replace(/\p{M}/gu, '').replace(/ß/g, 'ss')
}
