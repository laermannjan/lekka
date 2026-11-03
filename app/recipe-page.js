import { formatAmount, formatNumber, scaleAmount } from './amount.js'
import { renderReading } from './read.js'
import { aboutOf, gather, phrase, servings, sourceName, stepsOf, totalTime } from './recipe.js'
import { element, overview, roundButton, said, wave } from './ui.js'
import { t } from './i18n.js'

/**
 * A recipe as it is read before cooking: what it is and how long it takes, everything that
 * goes in, gathered once, and then the steps, each a sentence with its amounts in it - or
 * the same flow as a table. Cooking it starts from the bar at the bottom of the screen,
 * which is the caller's.
 *
 * How much is set where it is listed: the yield and every amount in the gathered list are
 * fields, and typing in one scales the whole recipe by it. Everything else follows as it is
 * typed, in place, so the field keeps the keyboard and nothing is drawn again under it.
 *
 * `state` is `{ factor, table }` and lives with the caller. `on` holds what the screen
 * cannot do itself: `back`, `more` (table, edit, share, delete), `redraw`, and `factor`,
 * told each factor as it is typed.
 */
export function renderRecipe(card, state, on) {
  const steps = stepsOf(card)
  const about = aboutOf(card)
  const total = totalTime(steps)

  // Every amount on the screen, so a field being typed in can be followed by the rest.
  const shown = []
  const fields = []
  const scaled = element('p', 'scaled')
  const follow = (factor, typing = null) => {
    for (const { node, amount } of shown) node.textContent = formatAmount(scaleAmount(amount, factor))
    for (const one of fields) if (one.input !== typing) one.show(factor)
    const changed = Math.abs(factor - 1) > 0.005
    const reset = element('button', 'plain', t('Back to the recipe’s amounts'))
    reset.type = 'button'
    reset.onclick = () => {
      follow(1)
      on.factor(1)
    }
    scaled.replaceChildren(...(changed ? [element('span', 'num', `× ${formatNumber(round(factor, 100))}`), reset] : []))
    if (typing) on.factor(factor)
  }
  const field = (amount, label) => {
    const one = amountField(amount, label, follow)
    fields.push(one)
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
      : [
          ingredients(card, field, scaled, state.factor, shown),
          method(steps, state.factor, (node, amount) => shown.push({ node, amount })),
        ]),
  ]
  follow(state.factor)
  return parts
}

function ingredients(card, field, scaled, factor, shown) {
  const lines = gather(card)
  const counted = servings(card.yields)
  const makes = counted
    ? field({ kind: 'number', value: counted.count, unit: counted.unit }, counted.unit ? t('How much it makes, in {unit}', { unit: counted.unit }) : t('How much it makes'))
    : element('span', 'quiet', card.yields ?? '')
  const editable = lines.some((line) => line.amounts.length === 1 && line.amounts[0].kind === 'number')

  return element('section', 'ingredients', undefined, [
    card.yields ? element('p', 'yield', undefined, [element('span', 'for', t('for')), makes]) : null,
    overview(lines, factor, (line) => {
      const one = line.amounts.length === 1 ? line.amounts[0] : null
      if (one?.kind === 'number') return element('span', 'amount', undefined, [field(one, one.unit ? t('{name}, in {unit}', { name: line.name, unit: one.unit }) : line.name)])
      // In two units, or as a range, an amount is shown and followed, not typed in.
      const node = element('span', 'amount', line.amounts.map((each) => formatAmount(scaleAmount(each, factor))).join(' + '))
      if (line.amounts.length === 1 && one) shown.push({ node, amount: one })
      return node
    }),
    scaled,
    editable ? element('p', 'hint', t('Change any amount, and the whole recipe follows.')) : null,
  ])
}

/**
 * One amount as a field: its number to type over, its unit after it. Typing a number
 * tells `follow` the factor it makes; leaving the field shows what the factor makes of
 * it again, whatever was left in it.
 */
function amountField(amount, label, follow) {
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
    follow(factor, input)
  }
  input.onkeydown = (event) => {
    if (event.key === 'Enter') input.blur()
  }
  input.onblur = () => show(factor)
  input.onfocus = () => input.select()
  return {
    input,
    show: (next) => show(next),
    node: element('label', 'field', undefined, [input, amount.unit ? element('span', 'unit', amount.unit) : null]),
  }
}

function method(steps, factor, follow) {
  return element(
    'ol',
    'method',
    undefined,
    steps.map((step) =>
      element('li', '', undefined, [
        wave(),
        element('div', 'step-row', undefined, [
          element('span', 'n', String(step.n)),
          element('p', 'sentence', undefined, said(phrase(step), factor, follow)),
        ]),
      ]),
    ),
  )
}

function round(value, to = 10) {
  return Math.round(value * to) / to
}
