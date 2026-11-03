import { formatAmount, scaleAmount } from './amount.js'
import { marks } from './recipe.js'

/**
 * The few parts every screen is built from. Icons are drawn here as strokes, the way the
 * system draws its own, and carry no meaning of their own: a button that is only an icon
 * says what it does in its label.
 */

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  up: '<path d="M5 15l7-7 7 7"/>',
  play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  basket: '<path d="M4.5 9h15l-1.5 9.2a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8z"/><path d="M9 9l3-5 3 5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" stroke="none"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 10h18M10 10v10"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/>',
  more: '<circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/>',
  paste: '<path d="M9 4h6v3H9zM7 5H5v16h14V5h-2"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  clear: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M9 9l6 6M15 9l-6 6" stroke="var(--group)"/>',
}

export function icon(name, size = 22) {
  const holder = element('span')
  holder.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
  return holder.firstChild
}

/** A round glass button that is only an icon, and so says what it does to a screen reader. */
export function roundButton(name, label, onClick) {
  const button = element('button', 'round glass', undefined, [icon(name)])
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.onclick = onClick
  return button
}

/**
 * A recipe's picture: its photo when it has one, its first letter on a colour of its own
 * when it does not. The colour comes from the name, so a recipe keeps it.
 */
export function picture(card, className, photo = null) {
  const box = element('span', `picture ${className}`)
  box.setAttribute('aria-hidden', 'true')
  if (photo) {
    const img = element('img')
    img.src = photo
    img.alt = ''
    img.loading = 'lazy'
    box.append(img)
    return box
  }
  box.textContent = (card?.title ?? '?').charAt(0).toLocaleUpperCase()
  box.style.background = colourOf(card?.title)
  return box
}

/** A recipe's own colour, the same wherever it is shown. */
export function colourOf(title) {
  return COLOURS[hash(title ?? '') % COLOURS.length]
}

const COLOURS = ['#8e3b26', '#3e4f3f', '#7a6528', '#a8742a', '#4a4136', '#5a2a24', '#3f5566', '#6b3f55']

function hash(text) {
  let sum = 0
  for (const char of text) sum = (sum * 31 + char.codePointAt(0)) >>> 0
  return sum
}

/** A sheet that slides up from the bottom, closed by its own buttons, Escape or the scrim. */
export function slide(...parts) {
  const box = element('dialog', 'slide')
  const body = element('div', '', undefined, [element('span', 'grabber'), ...parts])
  box.append(body)
  box.onclick = (event) => {
    if (event.target === box) box.close()
  }
  box.onclose = () => box.remove()
  // Focused itself, not its first button: a phone would ring that button as if it were
  // picked. A sheet with a field focuses the field after.
  box.autofocus = true
  document.body.append(box)
  box.showModal()
  return box
}

/**
 * A phone's keyboard covers the bottom of the page without the page being told, and a
 * sheet anchored there opens behind it. This says how much is covered, as `--keyboard`,
 * so whatever stands at the bottom can stand above it instead.
 */
export function watchKeyboard() {
  const view = window.visualViewport
  if (!view) return
  // Safari does not always say when the keyboard goes - not when its own address bar
  // takes the focus, say - so a keyboard is only counted while a field of ours has it.
  const typing = () => document.hasFocus() && Boolean(document.activeElement?.matches('input, textarea'))
  const measure = () => {
    const covered = typing() ? Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop)) : 0
    document.documentElement.style.setProperty('--keyboard', `${covered}px`)
    document.documentElement.classList.toggle('keyboard', covered > 80)
  }
  // Again once the keyboard has finished moving, which is after the focus has.
  const soon = () => setTimeout(measure, 350)
  view.addEventListener('resize', measure)
  view.addEventListener('scroll', measure)
  for (const event of ['focusin', 'focusout']) document.addEventListener(event, soon)
  for (const event of ['focus', 'blur']) window.addEventListener(event, soon)
  measure()
}

/** A row in a sheet's menu: an icon and what it does. */
export function menuItem(name, text, run, className = '') {
  const button = element('button', className, undefined, [icon(name, 20), text])
  button.type = 'button'
  button.onclick = run
  return button
}

/** The wavy rule a step starts with: drawn long, and cut to whatever width it is given. */
export function wave() {
  const holder = element('span')
  holder.innerHTML = `<svg class="wave" height="8" aria-hidden="true"><path d="M1 4q4 -3.5 8 0${'t8 0'.repeat(150)}"/></svg>`
  return holder.firstChild
}

/**
 * The parts `phrase` reads a step out as, drawn: words in the serif, every number out of
 * it, a time or a heat as a token in its own colour, and an ingredient as a token of its
 * amount and name, at `factor`. `follow`, when given, is handed each amount as it is
 * drawn, with what it shows, so it can be shown at another factor without drawing again.
 */
export function said(parts, factor, follow = null) {
  return parts.map((part) => {
    if (part.kind === 'text') return document.createTextNode(part.text)
    if (part.kind !== 'use') return element('span', part.kind === 'number' ? 'num' : `token ${part.kind}`, part.text)
    const amount = element('span', 'num', formatAmount(scaleAmount(part.node.amount, factor)))
    if (part.node.amount) follow?.(amount, part.node.amount)
    return element('span', 'token use', undefined, [part.node.amount ? amount : null, part.node.amount ? ' ' : null, ...said(marks(part.node.name))])
  })
}

/**
 * Every ingredient once, as `gather` adds them up: how much, right-aligned against what.
 * Here, and on the shopping list, an ingredient's aside is shown: what to buy, how to
 * prepare it. In a step it is not. `amountOf`, when given, draws a line's amount instead.
 */
export function overview(lines, factor, amountOf = null) {
  return element(
    'div',
    'overview',
    undefined,
    lines.map((line) => {
      const amount =
        amountOf?.(line) ??
        element('span', 'amount', line.amounts.map((each) => formatAmount(scaleAmount(each, factor))).join(' + '))
      const name = element('span', 'name', undefined, said(marks(line.name)))
      if (line.aside) name.append(' ', element('span', 'quiet', line.aside))
      return element('div', 'line', undefined, [amount, name])
    }),
  )
}

/**
 * How much of a timer is gone, drawn around something: a circle that fills as it runs.
 * The arc counts in hundredths whatever its size, so the clock moves every ring alike.
 */
export function ring(timer, size = 30) {
  const holder = element('span', 'ring')
  holder.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="3"/><circle class="arc" cx="15" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100" transform="rotate(-90 15 15)"/></svg>`
  const arc = holder.querySelector('.arc')
  arc.dataset.ends = String(timer.ends)
  arc.dataset.total = String(timer.total)
  arc.setAttribute('stroke-dashoffset', arcOffset(timer.ends, timer.total))
  return holder
}

export function arcOffset(ends, total) {
  const left = Math.max(0, (ends - Date.now()) / 1000)
  return (100 * (1 - left / total)).toFixed(1)
}

export function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children.filter(Boolean))
  return node
}
