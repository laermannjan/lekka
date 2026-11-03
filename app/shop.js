import { formatAmount, formatNumber, scaleAmount } from './amount.js'
import { gather, marks, servings } from './recipe.js'
import { element, icon, roundButton, said } from './ui.js'
import { t } from './i18n.js'

/**
 * What to buy for a recipe: every ingredient once, at the recipe's factor, less what is
 * at home. A line ticked off is at home entirely; one with an amount noted is at home in
 * part, and the rest is what is bought. Shared as plain text, it goes wherever a list can.
 *
 * `kept` is `{ home: {key: true}, have: {key: '20'} }`, the caller's to keep. `on` holds
 * `back`, `keep`, handed what is kept next, and `dock`, for the button that shares it.
 */
export function renderShopping(card, factor, kept, on) {
  const rows = gather(card).map((line) => rowOf(line, factor, kept))
  const buy = rows.filter((row) => !row.home)
  const home = rows.filter((row) => row.home)
  const made = makes(card, factor)

  const share = element('button', 'start', undefined, [icon('share', 18), buy.length === 1 ? t('Share 1 item') : t('Share {n} items', { n: buy.length })])
  share.type = 'button'
  share.disabled = buy.length === 0
  share.onclick = async () => {
    const text = [made ? t('{title}, for {made}', { title: card.title, made }) : card.title, ...buy.map((row) => `- ${row.text}`)].join('\n')
    try {
      if (navigator.share) return await navigator.share({ title: t('Shopping list: {title}', { title: card.title }), text })
      await navigator.clipboard.writeText(text)
      share.lastChild.textContent = t('Copied')
    } catch {
      // Closing the share sheet is no failure; the list is still here.
    }
  }
  on.dock(element('div', 'row', undefined, [share]))

  const toggle = (row) =>
    on.keep({
      home: { ...kept.home, [row.key]: !row.home },
      have: row.home ? { ...kept.have, [row.key]: '' } : kept.have,
    })

  return [
    element('div', 'bar', undefined, [roundButton('back', t('Back to the recipe'), on.back)]),
    element('header', 'shop-head', undefined, [
      element('h1', 'title', t('Shopping list')),
      element('p', 'quiet', made ? t('{title}, for {made}', { title: card.title, made }) : card.title),
    ]),
    buy.length
      ? element('ul', 'shop', undefined, buy.map((row) => buyRow(row, kept, on, toggle)))
      : element('p', 'hint', t('Everything is at home.')),
    home.length ? element('p', 'label', t('At home')) : null,
    home.length ? element('ul', 'shop home', undefined, home.map((row) => homeRow(row, toggle))) : null,
  ]
}

let noting = null

function buyRow(row, kept, on, toggle) {
  const check = element('button', 'check')
  check.type = 'button'
  check.setAttribute('aria-label', t('{name}: at home, take off the list', { name: row.name }))
  check.onclick = () => toggle(row)

  const name = element('span', 'name', undefined, said(marks(row.name)))
  if (row.aside) name.append(' ', element('span', 'quiet', row.aside))
  const text = element('span', 'text', undefined, [name, row.sub ? element('span', 'sub', row.sub) : null])

  let amount = element('span', 'amount', row.amount)
  if (row.notable) {
    amount = element('button', 'amount', row.amount)
    amount.type = 'button'
    amount.setAttribute('aria-label', t('{name}: note how much is at home', { name: row.name }))
    amount.onclick = () => {
      noting = noting === row.key ? null : row.key
      on.keep(kept)
    }
  }

  const parts = [element('div', 'line', undefined, [check, text, amount])]
  if (noting === row.key) {
    const input = element('input')
    input.type = 'text'
    input.inputMode = 'decimal'
    input.enterKeyHint = 'done'
    input.value = kept.have[row.key] ?? ''
    input.setAttribute('aria-label', row.unit ? t('{name} at home, in {unit}', { name: row.name, unit: row.unit }) : t('{name} at home', { name: row.name }))
    // Kept when it is done with, not on every key: keeping draws the list again.
    input.onchange = () => on.keep({ ...kept, have: { ...kept.have, [row.key]: input.value } })
    parts.push(element('label', 'noting', undefined, [element('span', 'quiet', t('at home already')), input, element('span', 'quiet', row.unit)]))
    queueMicrotask(() => input.focus())
  }
  return element('li', '', undefined, parts)
}

function homeRow(row, toggle) {
  const check = element('button', 'check done', undefined, [icon('check', 14)])
  check.type = 'button'
  check.setAttribute('aria-label', t('{name}: put back on the list', { name: row.name }))
  check.onclick = () => toggle(row)
  return element('li', '', undefined, [
    element('div', 'line', undefined, [check, element('span', 'text', undefined, [element('span', 'name', undefined, said(marks(row.name)))]), element('span', 'amount', row.all)]),
  ])
}

/**
 * One line of the list at the factor. Only a line with one amount in a measure can have
 * part of it at home; one in two units, or in words, is bought or it is not.
 */
function rowOf(line, factor, kept) {
  const key = `${line.name}\u0000${line.aside ?? ''}`
  const one = line.amounts.length === 1 && line.amounts[0].kind !== 'words' ? scaleAmount(line.amounts[0], factor) : null
  const all = line.amounts.map((amount) => formatAmount(scaleAmount(amount, factor))).join(' + ')
  const held = one ? Number(String(kept.have[key] ?? '').replace(',', '.')) || 0 : 0
  const less = (value) => Math.max(0, Math.round((value - held) * 100) / 100)
  const left = one && (one.kind === 'range' ? { ...one, from: less(one.from), to: less(one.to) } : { ...one, value: less(one.value) })
  const gone = Boolean(left) && (left.kind === 'range' ? left.to : left.value) === 0
  const amount = left ? formatAmount(left) : all

  const steps = line.steps.length > 1 ? t('for steps {list} and {last}', { list: line.steps.slice(0, -1).join(', '), last: line.steps.at(-1) }) : ''
  const part = held > 0 && !gone ? t('{held} at home, {all} in all', { held: `${formatNumber(held)} ${one.unit}`.trim(), all: formatAmount(one) }) : ''
  return {
    key,
    name: line.name,
    aside: line.aside,
    home: Boolean(kept.home[key]) || gone,
    amount,
    all,
    notable: Boolean(one),
    unit: one?.unit ?? '',
    sub: [steps, part].filter(Boolean).join(' · '),
    text: [amount, line.name].filter(Boolean).join(' ') + (line.aside ? `, ${line.aside}` : ''),
  }
}

function makes(card, factor) {
  const counted = servings(card.yields)
  if (!counted) return card.yields
  return `${formatNumber(Math.round(counted.count * factor * 10) / 10)} ${counted.unit}`.trim()
}
