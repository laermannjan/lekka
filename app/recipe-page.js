import { formatAmount, formatNumber } from './amount.js'
import { renderReading } from './read.js'
import { aboutOf, gather, marks, phrase, servings, sourceName, stepsOf, totalTime } from './recipe.js'
import { element, overview, roundButton, said, slide, wave } from './ui.js'

/**
 * A recipe as it is read before cooking: what it is and how long it takes, everything that
 * goes in, gathered once, and then the steps, each a sentence with its amounts in it - or
 * the same flow as a table. Cooking it starts from the bar at the bottom of the screen,
 * which is the caller's.
 *
 * Every amount on it scales the whole recipe: the yield's, a gathered one, one in a step.
 * Each opens the same sheet, which asks how much there is of that one thing.
 *
 * `state` is `{ factor, table }` and lives with the caller, so the screen can be drawn
 * again without losing any of it. `on` holds what the screen cannot do itself: `back`,
 * `more` (table, edit, share, delete), and `redraw`.
 */
export function renderRecipe(card, state, on) {
  const steps = stepsOf(card)
  const about = aboutOf(card)
  const total = totalTime(steps)
  const scale = (node) => scaleSheet(node, state, on)

  const facts = element('p', 'facts', undefined, [
    total ? element('span', 'token time', total) : null,
    element('span', '', `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`),
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

  return [
    element('div', 'bar', undefined, [
      roundButton('back', 'Back to recipes', on.back),
      roundButton('more', 'Table, edit, share or delete', on.more),
    ]),
    element('header', 'recipe-head', undefined, [
      element('h1', 'recipe-title', card.title),
      facts,
      ...about.notes.map((note) => element('p', 'note', note)),
    ]),
    ...(state.table
      ? [element('div', 'datasheet table', undefined, [renderReading(card, state.factor, 0)])]
      : [ingredients(card, state, scale), method(steps, state.factor, scale)]),
  ]
}

function ingredients(card, state, scale) {
  const lines = gather(card)
  const measured = lines.some((line) => line.amounts.some((amount) => amount.kind !== 'words'))
  return element('section', 'ingredients', undefined, [
    element('p', 'yield', undefined, [element('span', 'for', 'for'), yieldOf(card, state, scale)]),
    overview(lines, state.factor, scale),
    measured ? element('p', 'hint', 'Tap any amount to scale the whole recipe by it.') : null,
  ])
}

/** How much it makes, at the factor: an amount like any other, when it is counted. */
function yieldOf(card, state, scale) {
  const counted = servings(card.yields)
  if (!counted)
    return element('span', 'token use', state.factor === 1 ? (card.yields ?? 'as written') : `× ${formatNumber(round(state.factor))}`)
  const amount = { kind: 'number', value: counted.count, unit: counted.unit }
  const current = counted.count * state.factor
  const shown = formatAmount({ ...amount, value: round(current) })
  // A count scaled by what somebody has is rarely whole, and says it is near one.
  const near = Math.abs(round(current) - current) > 0.001 ? '≈ ' : ''
  const button = element('button', 'token use', `${near}${shown}`)
  button.type = 'button'
  button.setAttribute('aria-label', `Makes ${shown}: scale the recipe`)
  button.onclick = () => scale({ name: counted.unit || card.yields, amount, makes: true })
  return button
}

function method(steps, factor, scale) {
  return element(
    'ol',
    'method',
    undefined,
    steps.map((step) =>
      element('li', '', undefined, [
        wave(),
        element('div', 'step-row', undefined, [
          element('span', 'n', String(step.n)),
          element('p', 'sentence', undefined, said(phrase(step), factor, scale)),
        ]),
      ]),
    ),
  )
}

/**
 * `I only have 1,8 kg of it`: one amount, of the yield or of one ingredient, decides the
 * factor for all the others. The recipe behind the sheet follows as it is typed, so what
 * that makes of the rest is seen where it is read.
 */
function scaleSheet(node, state, on) {
  const base = node.amount.kind === 'range' ? node.amount.from : node.amount.value
  const unit = node.amount.unit
  let current = state

  const input = element('input')
  input.type = 'text'
  input.inputMode = 'decimal'
  input.enterKeyHint = 'done'
  input.value = formatNumber(round(base * state.factor))
  input.setAttribute('aria-label', `How much ${node.name}${unit ? `, in ${unit}` : ''}`)
  const factor = element('span', 'factor')

  const reset = element('button', 'plain', 'Back to the recipe’s amounts')
  reset.type = 'button'
  const done = element('button', 'first', 'Done')
  done.type = 'submit'

  const paint = (next) => {
    current = next
    factor.textContent = Math.abs(next.factor - 1) < 0.005 ? '' : `× ${formatNumber(round(next.factor, 100))}`
    on.redraw(next)
  }
  input.oninput = () => {
    const have = Number(input.value.replace(',', '.'))
    if (Number.isFinite(have) && have > 0) paint({ ...current, factor: have / base })
  }
  reset.onclick = () => {
    input.value = formatNumber(base)
    paint({ ...current, factor: 1 })
  }

  const form = element('form', '', undefined, [
    element('div', '', undefined, [
      element('h2', '', node.makes ? 'Scale by how much it makes' : `Scale by ${node.name}`),
      element('p', 'says', undefined, said(marks(`The recipe ${node.makes ? 'makes' : 'uses'} ${formatAmount(node.amount)}.`))),
    ]),
    element('label', 'have', undefined, [input, unit ? element('span', 'unit', unit) : null, factor]),
    element('p', 'hint', 'Everything else changes with it.'),
    element('div', 'actions', undefined, [reset, done]),
  ])
  // The recipe stays in sight behind it, so the sheet dims nothing.
  const sheet = slide(form)
  sheet.classList.add('clear')
  form.onsubmit = (event) => {
    event.preventDefault()
    sheet.close()
  }
  paint(current)
  input.focus()
  input.select()
}

function round(value, to = 10) {
  return Math.round(value * to) / to
}
