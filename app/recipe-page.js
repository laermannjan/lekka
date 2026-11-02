import { formatAmount, formatNumber, scaleAmount } from './amount.js'
import { renderReading } from './read.js'
import { aboutOf, servings, sourceName, stepsOf, totalTime } from './recipe.js'
import { element, icon, roundButton, slide } from './ui.js'

/** The steps a recipe without a count in its yield is scaled in. */
const FACTORS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]

/**
 * A recipe as it is read before cooking: what it is, how long it takes, how much of it,
 * then what goes in and what to do - or the same flow as a table.
 *
 * `state` is `{ factor, table, cooking }` and lives with the caller, so the screen can be
 * drawn again without losing any of it; `cooking` is the session when this recipe is the
 * one being cooked. `on` holds what the screen cannot do itself: `back`, `more` (edit,
 * share, delete), `cook`, and `redraw`.
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

  const toggle = element('div', 'segmented', undefined, [
    choice('List', !state.table, () => on.redraw({ ...state, table: false })),
    choice('Table', state.table, () => on.redraw({ ...state, table: true })),
  ])
  toggle.setAttribute('role', 'group')
  toggle.setAttribute('aria-label', 'Show as')

  return [
    element('div', 'bar', undefined, [
      roundButton('back', 'Back to recipes', on.back),
      roundButton('more', 'Edit, share or delete', on.more),
    ]),
    element('div', '', undefined, [element('h1', 'recipe-title', card.title), metaLine]),
    about.notes.length ? element('div', 'group', undefined, about.notes.map(noteRow)) : null,
    cookButton(steps, state, on),
    amounts(card, state, on),
    toggle,
    ...(state.table ? [table(card, state)] : list(steps, state, on, card)),
  ]
}

/** Into cook mode; once in it, back to the step you left, with how far along shown. */
function cookButton(steps, state, on) {
  const session = state.cooking
  const at = session ? Math.min(session.at, steps.length) : 0
  const fill = element('span', 'fill')
  fill.style.width = session ? `${Math.round(((at - 1) / steps.length) * 100)}%` : '0%'
  const button = element('button', 'cta', undefined, [
    fill,
    icon('play', 20),
    element('span', '', session ? `Continue cooking · Step ${at}` : 'Start cooking'),
  ])
  button.type = 'button'
  button.onclick = () => on.cook(state)
  return button
}

function choice(text, pressed, run) {
  const button = element('button', '', text)
  button.type = 'button'
  button.setAttribute('aria-pressed', String(pressed))
  button.onclick = run
  return button
}

function noteRow(note) {
  return element('div', 'item', undefined, [element('span', 'text', undefined, [element('span', 'main', note)])])
}

/**
 * How much: a count where the yield starts with one, `10 Portionen`, and a factor where it
 * does not. Either way what changes is one number every amount is multiplied by.
 */
function amounts(card, state, on) {
  const counted = servings(card.yields)
  const current = counted ? counted.count * state.factor : state.factor
  // A count scaled by what somebody has is rarely whole, and says it is near one.
  const near = Math.round(current * 10) / 10
  const about = Math.abs(near - current) > 0.001 ? '≈ ' : ''
  const shown = counted ? `${about}${formatNumber(near)}` : `×${about}${formatNumber(near)}`

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
  return element('div', 'stepper', undefined, [
    element('span', 'what', counted ? counted.unit || card.yields : 'Amounts'),
    less,
    count,
    more,
  ])
}

function button(name, label, run) {
  const node = element('button', '', undefined, [icon(name, 20)])
  node.type = 'button'
  node.setAttribute('aria-label', label)
  node.onclick = run
  return node
}

function list(steps, state, on, card) {
  const using = steps.filter((step) => step.ingredients.length)
  return [
    element('h2', 'heading', 'Ingredients'),
    element(
      'div',
      'group',
      undefined,
      using.flatMap((step) => [
        element('div', 'label', `Step ${step.n} · ${step.title}`),
        ...step.ingredients.map((node) => ingredient(node, state, on, card)),
      ]),
    ),
    element('h2', 'heading', 'Steps'),
    element('ol', 'group plain', undefined, steps.map(stepRow)),
  ]
}

function ingredient(node, state, on, card) {
  const scaled = formatAmount(scaleAmount(node.amount, state.factor))
  const name = element('span', 'main', node.name)
  if (node.aside) name.append(' ', element('span', 'quiet', node.aside))

  let amount = null
  if (node.amount && node.amount.kind !== 'words') {
    amount = element('button', 'end', scaled)
    amount.type = 'button'
    amount.setAttribute('aria-label', `${scaled} ${node.name}: scale by what you have`)
    amount.onclick = () => scaleBy(node, card, state, on)
  } else if (scaled) {
    amount = element('span', 'end', scaled)
  }
  return element('div', 'item ingredient', undefined, [element('span', 'text', undefined, [name]), amount])
}

function stepRow(step) {
  const text = element('span', 'text', undefined, [
    element('span', 'main', step.title),
    step.aside ? element('span', 'sub', step.aside) : null,
  ])
  return element('li', 'item step', undefined, [
    element('span', 'marker', String(step.n)),
    text,
    step.timeShown ? element('span', 'end', step.time.text) : null,
  ])
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
