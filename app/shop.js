import { fraction, scaleAmount, showAmount } from './amount.js'
import { gather, marks, servings } from './recipe.js'
import { element, icon, roundButton, said } from './ui.js'
import { t } from './i18n.js'

/**
 * What to buy for a recipe: every ingredient once, at the recipe's factor, less what is
 * at home. Every line starts with nothing at home, and typing what there is leaves the
 * rest to buy. A line there is all of, or one tapped to cross it out, goes to the bottom,
 * at home, and comes back with a tap. Shared as plain text, it goes wherever a list can.
 *
 * `kept` is `{ home: {key: true}, have: {key: '20'} }`, the caller's to keep. `on` holds
 * `back`; `keep`, handed what is kept next and whether the list is drawn again for it;
 * and `dock`, for the button that shares it.
 */
export function renderShopping(card, factor, kept, on) {
  const lines = gather(card)
  const rows = lines.map((line) => rowOf(line, factor, kept))
  const buy = rows.filter((row) => !row.home)
  const home = rows.filter((row) => row.home)
  const made = makes(card, factor)

  // What is typed is kept as it is left, without drawing the list again under the next
  // field a thumb goes to; only a line that leaves the list draws it again.
  let now = kept
  const keep = (next, redraw) => {
    now = next
    on.keep(next, redraw)
  }
  const have = (row, value) => {
    const next = { ...now, have: { ...now.have, [row.key]: value } }
    keep(next, rowOf(row.line, factor, next).home)
  }
  const cross = (row) => keep({ ...now, home: { ...now.home, [row.key]: true } }, true)
  const restore = (row) => keep({ home: { ...now.home, [row.key]: false }, have: { ...now.have, [row.key]: '' } }, true)

  const share = element('button', 'start', undefined, [icon('share', 18), buy.length === 1 ? t('Share 1 item') : t('Share {n} items', { n: buy.length })])
  share.type = 'button'
  share.disabled = buy.length === 0
  share.onclick = async () => {
    const left = lines.map((line) => rowOf(line, factor, now)).filter((row) => !row.home)
    const text = [made ? t('{title}, for {made}', { title: card.title, made }) : card.title, ...left.map((row) => `- ${row.text}`)].join('\n')
    try {
      if (navigator.share) return await navigator.share({ title: t('Shopping list: {title}', { title: card.title }), text })
      await navigator.clipboard.writeText(text)
      share.lastChild.textContent = t('Copied')
    } catch {
      // Closing the share sheet is no failure; the list is still here.
    }
  }
  on.dock(element('div', 'row', undefined, [share]))

  return [
    element('div', 'bar', undefined, [roundButton('back', t('Back to the recipe'), on.back)]),
    element('header', 'shop-head', undefined, [
      element('h1', 'title', t('Shopping list')),
      element('p', 'quiet', made ? t('{title}, for {made}', { title: card.title, made }) : card.title),
    ]),
    buy.length ? element('p', 'lead', t('Enter what you already have. Tap what you do not need to cross it out.')) : null,
    buy.length
      ? element('ul', 'shop', undefined, buy.map((row) => buyRow(row, have, cross)))
      : element('p', 'lead', t('Everything is at home.')),
    home.length ? element('p', 'label', t('At home')) : null,
    home.length ? element('ul', 'shop home', undefined, home.map((row) => homeRow(row, restore))) : null,
  ]
}

/**
 * A line still to buy: how much is at home, a field at nothing until it is typed in, and
 * what it is with what is left to buy under it, which crosses it out when tapped. A line
 * in two units, or in words, has no field: it is bought or it is not.
 */
function buyRow(row, have, cross) {
  const sub = element('span', 'sub', undefined, toBuy(row.left, row.held))
  const name = element('span', 'name', undefined, said(marks(row.name)))
  if (row.aside) name.append(' ', element('span', 'quiet', row.aside))
  const text = element('button', 'text', undefined, [name, sub])
  text.type = 'button'
  text.setAttribute('aria-label', t('{name}: not needed, cross it out', { name: row.name }))
  text.onclick = () => cross(row)

  if (!row.one) return element('li', 'line', undefined, [element('span', 'have amount', row.all), text])

  const input = element('input')
  input.type = 'text'
  input.inputMode = 'decimal'
  input.enterKeyHint = 'done'
  input.autocomplete = 'off'
  input.placeholder = '0'
  input.value = row.have
  input.setAttribute('aria-label', row.one.unit ? t('{name} at home, in {unit}', { name: row.name, unit: row.one.unit }) : t('{name} at home', { name: row.name }))
  const field = element('label', 'field', undefined, [input, row.one.unit ? element('span', 'unit', row.one.unit) : null])
  const fit = () => {
    input.style.width = `${Math.max(input.value.length, 1) + 0.4}ch`
    field.classList.toggle('held', number(input.value) > 0)
  }
  fit()
  input.oninput = () => {
    fit()
    sub.replaceChildren(...toBuy(less(row.one, number(input.value)), number(input.value)))
  }
  input.onchange = () => have(row, input.value)
  input.onkeydown = (event) => {
    if (event.key === 'Enter') input.blur()
  }
  input.onfocus = () => input.select()
  return element('li', 'line', undefined, [element('span', 'have', undefined, [field]), text])
}

/** `605 g kaufen`, and once some is at home, `noch 205 g kaufen`. */
function toBuy(left, held) {
  if (!left) return []
  // Said around the amount, which is drawn in the middle of whatever the language puts around it.
  const amount = { amount: '\u0000' }
  const [before, after] = (held > 0 ? t('{amount} still to buy', amount) : t('{amount} to buy', amount)).split('\u0000')
  return [before, element('span', 'num', showAmount(left)), after]
}

function homeRow(row, restore) {
  const button = element('button', 'line', undefined, [element('span', 'amount', row.all), element('span', 'name', undefined, said(marks(row.name)))])
  button.type = 'button'
  button.setAttribute('aria-label', t('{name}: put back on the list', { name: row.name }))
  button.onclick = () => restore(row)
  return element('li', '', undefined, [button])
}

/**
 * One line of the list at the factor. Only a line with one amount in a measure can have
 * part of it at home; one in two units, or in words, is bought or it is not.
 */
function rowOf(line, factor, kept) {
  const key = `${line.name}\u0000${line.aside ?? ''}`
  const one = line.amounts.length === 1 && line.amounts[0].kind !== 'words' ? scaleAmount(line.amounts[0], factor) : null
  const all = line.amounts.map((amount) => showAmount(scaleAmount(amount, factor))).join(' + ')
  const have = one ? (kept.have[key] ?? '') : ''
  const held = number(have)
  const left = one ? less(one, held) : null
  const gone = Boolean(left) && (left.kind === 'range' ? left.to : left.value) === 0
  const amount = left ? showAmount(left) : all
  return {
    key,
    line,
    name: line.name,
    aside: line.aside,
    home: Boolean(kept.home[key]) || gone,
    one,
    all,
    have,
    held,
    left,
    text: [amount, line.name].filter(Boolean).join(' ') + (line.aside ? `, ${line.aside}` : ''),
  }
}

/** What is left of an amount once `held` of it is at home. */
function less(one, held) {
  const minus = (value) => Math.max(0, Math.round((value - held) * 100) / 100)
  return one.kind === 'range' ? { ...one, from: minus(one.from), to: minus(one.to) } : { ...one, value: minus(one.value) }
}

function number(text) {
  return Number(String(text).replace(',', '.')) || 0
}

function makes(card, factor) {
  const counted = servings(card.yields)
  if (!counted) return card.yields
  return `${fraction(Math.round(counted.count * factor * 100) / 100)} ${counted.unit}`.trim()
}
