import { buildGrid, frontierAt, timeline } from './grid.js'
import { renderGrid } from './render.js'

/**
 * The card's own table, walked sideways.
 *
 * It is the whole table, drawn by the same code and scrolled the same way. What the walk
 * adds is that the ingredient column is pinned and its contents follow the scroll: as a
 * step passes behind the pin it takes the place of everything it consumed, so the column
 * always says what is standing on the counter rather than what was bought. An ingredient
 * nothing has reached yet stays; only a step replaces it.
 *
 * Rows never move, because a step stands on exactly the rows it took. The card therefore
 * keeps its height for the whole walk.
 */
export function renderWalk(card, scale, at, onAt) {
  const grid = buildGrid(card)
  const stops = timeline(grid)

  const box = element('div', 'scroll')
  const all = element('div', 'walk')
  if (stops.length === 0) {
    all.append(element('p', 'band', 'This card has no steps.'))
    return all
  }

  const table = renderGrid({ ...grid, heading: 'Goes in' }, scale)
  box.append(table)

  // The three ingredient cells of each row, to be hidden as steps take them over.
  const rows = grid.rows.map(() => [])
  for (const cell of table.querySelectorAll('[data-row]')) rows[Number(cell.dataset.row)].push(cell)

  const heads = [...table.querySelectorAll('.label:not(.heading)')]
  const head = grid.band.length
  const bottom = head + 1 + grid.rows.length

  let standing = []
  let here = Math.min(Math.max(at, 1), stops.length)

  const draw = (column) => {
    for (const node of standing) node.remove()
    standing = []

    const taken = new Set()
    for (const band of frontierAt(grid, column)) {
      if (band.node.kind !== 'step') continue
      for (let row = band.row; row < band.row + band.rowSpan; row++) taken.add(row)

      const box = element('div', 'carried standing', band.node.verb)
      if (band.node.aside) box.append(element('span', 'aside', band.node.aside))
      const top = head + 2 + band.row
      box.style.gridArea = `${top} / 1 / span ${band.rowSpan} / span 3`
      if (top + band.rowSpan - 1 === bottom) box.classList.add('lowest')
      table.append(box)
      standing.push(box)
    }

    // Covered, not hidden: the row keeps the height its ingredient asked for, so the
    // table does not shrink as steps take rows over and the walk never moves under a hand.
    rows.forEach((cells, row) => {
      for (const cell of cells) cell.classList.toggle('covered', taken.has(row))
    })
  }

  const pinned = () => table.querySelector('.heading').getBoundingClientRect().width

  /** The first column standing clear of the pin is the one the walk is on. */
  const reading = () => {
    const edge = box.getBoundingClientRect().left + pinned()
    const found = heads.findIndex((node) => node.getBoundingClientRect().left >= edge - 2)
    return found === -1 ? stops.length : found + 1
  }

  const label = element('span', 'label')
  const back = element('button', '', '←')
  const on = element('button', '', '→')

  const show = () => {
    label.textContent = `${pad(here)} / ${pad(stops.length)}`
    back.disabled = here === 1
    on.disabled = here === stops.length
  }

  const settle = (column) => {
    if (column === here) return
    here = column
    draw(stops[here - 1])
    show()
    onAt(here)
  }

  const go = (column) => {
    const index = Math.min(Math.max(column, 1), stops.length)
    const node = heads[index - 1]
    const left = box.scrollLeft + node.getBoundingClientRect().left - box.getBoundingClientRect().left
    box.scrollTo({ left: left - pinned(), behavior: 'smooth' })
    settle(index)
  }

  back.onclick = () => go(here - 1)
  on.onclick = () => go(here + 1)

  // A thumb can land anywhere; the pinned column follows wherever it stopped.
  box.addEventListener('scroll', () => settle(reading()), { passive: true })

  const tick = element('div', 'tick')
  tick.append(back, label, on)
  all.append(box, tick)

  draw(stops[here - 1])
  show()
  requestAnimationFrame(() => {
    const node = heads[here - 1]
    box.scrollLeft = node.getBoundingClientRect().left - box.getBoundingClientRect().left - pinned()
  })

  return all
}

function pad(number) {
  return String(number).padStart(2, '0')
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
