import { formatAmount, formatNumber, scaleAmount } from './amount.js'
import { renderReading } from './read.js'
import { aboutOf, servings, sourceName, stepsOf, totalTime } from './recipe.js'
import { element, icon, roundButton, slide, uses } from './ui.js'

/** The steps a recipe without a count in its yield is scaled in. */
const FACTORS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

/**
 * A recipe as it is read before cooking: what it is and how long it takes, then what goes
 * in and what to do - or the same flow as a table. Cooking it starts from the bar at the
 * bottom of the screen, which is the caller's.
 *
 * `state` is `{ factor, table }` and lives with the caller, so the screen can be drawn
 * again without losing any of it. `on` holds what the screen cannot do itself: `back`,
 * `more` (edit, share, delete, table), and `redraw`.
 */
export function renderRecipe(card, state, on) {
  const steps = stepsOf(card)
  const about = aboutOf(card)
  const total = totalTime(steps)

  const meta = [`${steps.length} ${steps.length === 1 ? 'step' : 'steps'}`, total].filter(Boolean).join(' · ')
  const metaLine = element('p', 'meta', meta)
  if (about.source) {
    metaLine.append(' · ')
    const link = element('a', '', sourceName(about.source))
    if (/^https?:\/\//.test(about.source)) {
      link.href = about.source
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
    }
    metaLine.append(link)
  }

  return [
    element('div', 'bar', undefined, [
      roundButton('back', 'Back to recipes', on.back),
      roundButton('more', 'Edit, share or delete', on.more),
    ]),
    element('header', 'recipe-head', undefined, [
      element('h1', 'recipe-title', card.title),
      metaLine,
      ...about.notes.map((note) => element('p', 'note', note)),
    ]),
    ...(state.table ? [table(card, state)] : [...ingredients(card, steps, state, on), ...method(steps)]),
  ]
}

/**
 * What goes in, under how much of it: a count where the yield starts with one,
 * `10 Portionen`, and a factor where it does not. Either way what changes is one number
 * every amount is multiplied by. Grouped by the step that takes them, once there is more
 * than one.
 */
function ingredients(card, steps, state, on) {
  const using = steps.filter((step) => step.ingredients.length)
  const rows =
    using.length > 1
      ? using.flatMap((step) => [`${step.n} · ${step.title}`, ...step.ingredients])
      : using.flatMap((step) => step.ingredients)
  const measured = rows.some((row) => typeof row !== 'string' && row.amount && row.amount.kind !== 'words')
  return [
    element('div', 'section-head', undefined, [element('h2', 'heading', 'Ingredients'), amounts(card, state, on)]),
    uses(rows, state.factor, (node) => scaleBy(node, card, state, on)),
    measured ? element('p', 'hint', 'Tap an amount to scale everything by what you have.') : null,
  ]
}

function amounts(card, state, on) {
  const counted = servings(card.yields)
  const current = counted ? counted.count * state.factor : state.factor
  // A count scaled by what somebody has is rarely whole, and says it is near one.
  const near = Math.round(current * 10) / 10
  const about = Math.abs(near - current) > 0.001 ? '≈ ' : ''
  const shown = counted ? `${about}${formatNumber(near)} ${counted.unit}`.trim() : `×${about}${formatNumber(near)}`

  const less = button('minus', counted ? `Fewer ${counted.unit}` : 'Smaller', () => {
    if (counted) on.redraw({ ...state, factor: Math.max(1, Math.ceil(current) - 1) / counted.count })
    else on.redraw({ ...state, factor: [...FACTORS].reverse().find((one) => one < current) ?? current })
  })
  const more = button('plus', counted ? `More ${counted.unit}` : 'Larger', () => {
    if (counted) on.redraw({ ...state, factor: (Math.floor(current) + 1) / counted.count })
    else on.redraw({ ...state, factor: FACTORS.find((one) => one > current) ?? current })
  })
  less.disabled = counted ? current <= 1 : current <= FACTORS[0]
  more.disabled = !counted && current >= FACTORS.at(-1)

  const count = element('span', 'count', shown)
  count.setAttribute('aria-live', 'polite')
  return element('div', 'stepper', undefined, [less, count, more])
}

function button(name, label, run) {
  const node = element('button', '', undefined, [icon(name, 18)])
  node.type = 'button'
  node.setAttribute('aria-label', label)
  node.onclick = run
  return node
}

function method(steps) {
  return [
    element('h2', 'heading', 'Steps'),
    element(
      'ol',
      'steps',
      undefined,
      steps.map((step) =>
        element('li', '', undefined, [
          element('span', 'n', String(step.n)),
          element('span', 'text', undefined, [
            element('span', 'main', step.title),
            step.aside ? element('span', 'sub', step.aside) : null,
          ]),
          element('span', 'end', step.timeShown ? step.time.text : ''),
        ]),
      ),
    ),
  ]
}

function table(card, state) {
  return element('div', 'datasheet table', undefined, [renderReading(card, state.factor, 0)])
}

/**
 * `I only have 1,8 kg of it`: the one amount you have decides the factor for all the
 * others. The sheet shows what that makes of the rest before anything changes.
 */
function scaleBy(node, card, state, on) {
  const base = node.amount
  const needed = base.kind === 'range' ? base.from : base.value
  const unit = base.unit ? element('span', 'unit', base.unit) : null

  const input = element('input')
  input.type = 'text'
  input.inputMode = 'decimal'
  input.enterKeyHint = 'done'
  input.value = formatNumber(needed * state.factor)
  input.setAttribute('aria-label', `${node.name} you have${base.unit ? `, in ${base.unit}` : ''}`)

  const factor = element('span', 'factor')
  const becomes = element('div', 'becomes')
  const use = element('button', 'first', 'Use these amounts')
  use.type = 'submit'
  const cancel = element('button', 'second', 'Cancel')
  cancel.type = 'button'

  const others = stepsOf(card)
    .flatMap((step) => step.ingredients)
    .filter((one) => one !== node && one.amount && one.amount.kind !== 'words')
  const counted = servings(card.yields)

  const have = () => Number(input.value.replace(',', '.'))
  const paint = () => {
    const ratio = have() / needed
    const fine = Number.isFinite(ratio) && ratio > 0
    use.disabled = !fine
    factor.textContent = fine ? `× ${formatNumber(Math.round(ratio * 100) / 100)}` : '×'
    becomes.replaceChildren(
      ...(counted ? [line(counted.unit || 'Yield', formatNumber(counted.count), fine ? `≈ ${formatNumber(Math.round(counted.count * ratio * 10) / 10)}` : '')] : []),
      ...others.map((one) =>
        line(one.name, formatAmount(one.amount), fine ? formatAmount(scaleAmount(one.amount, ratio)) : ''),
      ),
    )
  }
  input.oninput = paint

  const form = element('form', '', undefined, [
    element('div', '', undefined, [
      element('h2', '', 'Scale by what you have'),
      element('p', 'quiet', `${node.name} · the recipe needs ${formatAmount(base)}`),
    ]),
    element('div', 'have', undefined, [
      element('label', '', undefined, [
        element('span', 'small', 'You have'),
        element('span', 'entry', undefined, [input, unit]),
      ]),
      factor,
    ]),
    others.length || counted ? element('p', 'hint', 'Everything else becomes') : null,
    becomes,
    element('div', 'actions', undefined, [cancel, use]),
  ])
  const sheet = slide(form)
  form.onsubmit = (event) => {
    event.preventDefault()
    if (use.disabled) return
    sheet.close()
    on.redraw({ ...state, factor: have() / needed })
  }
  cancel.onclick = () => sheet.close()
  paint()
  input.focus()
  input.select()
}

function line(name, was, now) {
  return element('div', 'item', undefined, [
    element('span', 'text', undefined, [element('span', 'main', name)]),
    element('span', 'end', `was ${was}`),
    element('span', 'main', now),
  ])
}
