import { formatNumber, fraction, scaleAmount, showAmount } from './amount.js'
import { renderReading } from './read.js'
import { aboutOf, gather, phrase, servings, sourceName, stepsOf, totalTime } from './recipe.js'
import { before, divider, element, icon, overview, roundButton, said, uses } from './ui.js'
import { t } from './i18n.js'

/**
 * A recipe as it is read before cooking: what it is and how long it takes, how much of it,
 * everything that goes in, gathered once, and then the steps, each a sentence with what it
 * takes listed right under it - or the same flow as a table. Cooking it starts from the bar
 * at the bottom of the screen, which is the caller's.
 *
 * How much is set where it is shown: the stepper counts what the recipe makes, and every
 * amount in the gathered list is a field, typing in one scaling the whole recipe by it.
 * Everything else follows in place, so a field keeps the keyboard and nothing is drawn
 * again under it.
 *
 * `state` is `{ factor, table }` and lives with the caller. `on` holds what the screen
 * cannot do itself: `back`, `more` (table, edit, share, delete), `redraw`, `shop`, and
 * `factor`, told each factor as it is set.
 */
export function renderRecipe(card, state, on) {
  const steps = stepsOf(card)
  const about = aboutOf(card)
  const total = totalTime(steps)

  // Everything on the screen that says how much, each told the factor and the field typed in.
  const followers = []
  const scaled = element('p', 'scaled')
  const follow = (factor, typing = null) => {
    for (const one of followers) one(factor, typing)
    const reset = element('button', 'plain', t('Back to the recipe’s amounts'))
    reset.type = 'button'
    reset.onclick = () => change(1)
    const changed = Math.abs(factor - 1) > 0.005
    scaled.replaceChildren(...(changed ? [element('span', 'num', `× ${formatNumber(round(factor, 100))}`), reset] : []))
  }
  const change = (factor, typing = null) => {
    follow(factor, typing)
    on.factor(factor)
  }
  const shown = (node, amount) => followers.push((factor) => (node.textContent = showAmount(scaleAmount(amount, factor))))
  const field = (amount, label) => {
    const one = amountField(amount, label, change)
    followers.push((factor, typing) => typing !== one.input && one.show(factor))
    return one.node
  }

  const facts = element('p', 'facts', undefined, [
    total ? element('span', 'token time', total) : null,
    element('span', '', steps.length === 1 ? t('1 step') : t('{n} steps', { n: steps.length })),
  ])
  if (about.source) {
    const link = element('a', '', sourceName(about.source))
    if (/^https?:\/\//.test(about.source)) {
      link.href = about.source
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    }
    facts.append(link)
  }

  const parts = [
    element('div', 'bar', undefined, [
      roundButton('back', t('Back to recipes'), on.back),
      roundButton('more', t('Table, edit, share or delete'), on.more),
    ]),
    element('header', 'recipe-head', undefined, [
      element('h1', 'recipe-title', card.title),
      facts,
      ...about.notes.map((note) => element('p', 'note', note)),
    ]),
    ...(state.table
      ? [element('div', 'datasheet table', undefined, [renderReading(card, state.factor, 0)])]
      : [howMuch(card.yields, change, followers), ingredients(card, field, shown, scaled, state.factor, on.shop), method(card, steps, state.factor, shown)]),
  ]
  follow(state.factor)
  return parts
}

/**
 * How much the recipe makes: counted, a stepper of it, a whole one more or less at a
 * press; in words, only said.
 */
function howMuch(yields, change, followers) {
  const counted = servings(yields)
  if (!counted) return yields ? element('p', 'yield', undefined, [element('span', 'for', t('for')), element('span', 'quiet', yields)]) : null
  let now = counted.count
  const count = element('span', 'count')
  count.setAttribute('aria-live', 'polite')
  const fewer = roundButton('minus', t('Less'), () => change((Math.ceil(now - 0.01) - 1) / counted.count))
  const more = roundButton('plus', t('More'), () => change((Math.floor(now + 0.01) + 1) / counted.count))
  followers.push((factor) => {
    now = counted.count * factor
    count.textContent = fraction(round(now, 100))
    fewer.disabled = now <= 1.01
  })
  return element('section', 'stepper', undefined, [
    fewer,
    element('span', 'counted', undefined, [count, counted.unit ? element('span', 'unit', counted.unit) : null]),
    more,
  ])
}

function ingredients(card, field, shown, scaled, factor, shopping) {
  const lines = gather(card)
  const editable = lines.some((line) => line.amounts.length === 1 && line.amounts[0].kind === 'number')
  // The way to what to buy for it, right under what goes in.
  const shop = element('button', 'pill glass', undefined, [icon('basket', 18), t('Shopping list')])
  shop.type = 'button'
  shop.onclick = shopping

  return element('section', 'ingredients', undefined, [
    overview(lines, factor, (line) => {
      const one = line.amounts.length === 1 ? line.amounts[0] : null
      if (one?.kind === 'number') return element('span', 'amount', undefined, [field(one, one.unit ? t('{name}, in {unit}', { name: line.name, unit: one.unit }) : line.name)])
      // In two units, or as a range, an amount is shown and followed, not typed in.
      const node = element('span', 'amount', line.amounts.map((each) => showAmount(scaleAmount(each, factor))).join(' + '))
      if (line.amounts.length === 1 && one) shown(node, one)
      return node
    }),
    scaled,
    editable ? element('p', 'hint', t('Change any amount, and the whole recipe follows.')) : null,
    lines.length ? shop : null,
  ])
}

/**
 * One amount as a field: its number to type over, its unit after it. Typing a number
 * tells `change` the factor it makes; leaving the field shows what the factor makes of
 * it again, whatever was left in it.
 */
function amountField(amount, label, change) {
  const input = element('input')
  input.type = 'text'
  input.inputMode = 'decimal'
  input.enterKeyHint = 'done'
  input.autocomplete = 'off'
  input.setAttribute('aria-label', label)
  let factor = 1
  const fit = () => (input.style.width = `${Math.max(input.value.length, 1) + 0.4}ch`)
  const show = (next) => {
    factor = next
    input.value = formatNumber(round(scaleAmount(amount, next).value, amount.unit ? 10 : 2))
    fit()
  }
  input.oninput = () => {
    fit()
    const have = Number(input.value.replace(',', '.'))
    if (!Number.isFinite(have) || have <= 0) return
    factor = have / amount.value
    change(factor, input)
  }
  input.onkeydown = (event) => {
    if (event.key === 'Enter') input.blur()
  }
  input.onblur = () => show(factor)
  input.onfocus = () => input.select()
  return {
    input,
    show,
    node: element('label', 'field', undefined, [input, amount.unit ? element('span', 'unit', amount.unit) : null]),
  }
}

/** The steps: each a wavy rule with its number, its sentence, and what it takes under it. */
function method(card, steps, factor, shown) {
  return element('ol', 'method', undefined, [
    card.preparations.length ? element('li', '', undefined, [before(card.preparations)]) : null,
    ...steps.map((step) =>
      element('li', '', undefined, [
        divider(step.n),
        element('p', 'sentence', undefined, said(phrase(step))),
        step.ingredients.length ? uses(step.ingredients, factor, shown) : null,
      ]),
    ),
  ])
}

function round(value, to = 10) {
  return Math.round(value * to) / to
}
