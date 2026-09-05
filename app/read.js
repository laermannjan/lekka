import { renderCard } from './render.js'

/**
 * A card to read while cooking: the table, one scroll, and nothing else.
 *
 * There is no second view and no mode to choose. `STYLE.md` already says what to do
 * about a card that is wider than the screen, and this is that rule made into an
 * interface: a card that fits is drawn whole, however large the screen; only one that
 * does not fit gains the three places, the snapping, and a cell held at the left edge.
 * So the reading affordances are not a phone thing. They appear exactly when there is
 * somewhere to go, and dissolve when there is not.
 *
 * Nothing here knows how far the cook has got. There is no progress to keep: the card
 * is a reference, and where you are looking is the only state it has.
 *
 * `fit` is the other answer to a table that will not fit: shrink it until it does. It is
 * the whole card at once at the cost of the size it was set in, where reading is the size
 * it was set in at the cost of seeing it all - so the two are exclusive, and fitting turns
 * the reading affordances off because there is nowhere left to scroll to.
 */
export function renderReading(card, scale, at, { onAt, onFits, fit = false, beside = null } = {}) {
  const box = element('div', 'read')

  // Done, Now and Next name places on the screen rather than columns, so they cannot
  // scroll with the table. Next is the width that is left, and it is deliberately less
  // than a column: a card that runs on should say so.
  const places = element('div', 'places')
  const done = element('div', 'place', 'Done')
  const now = element('div', 'place now', 'Now')
  const nextPlace = element('div', 'place', 'Next')
  places.append(done, now, nextPlace)

  const scroll = element('div', 'scroll')
  const table = renderCard(card, scale, null, beside)
  scroll.append(table)
  box.append(places, scroll)

  /*
   * Where the table may come to rest. The first stop is the ingredient column, which is
   * three columns wide and so not the width of the ones after it; every stop after that
   * is one step. Snapping to this list is what gives the edges their grip.
   */
  let stops = [0]

  /* How wide the Done place is at a given stop. Never wider than it has to be: an
     ingredient block while one may still be standing there, the step's own width after
     that. Set once the card has been measured. */
  let doneAt = () => 0

  const settle = () => {
    /* Measured as the card is drawn when it is drawn whole. The reading tracks are wider
       than the card needs - the tail is a real track, the cap a real width, and the whole
       table is laid out at `max-content` - so a card still wearing the ones the last pass
       gave it can never be found to fit again, and reading is a one-way door. */
    box.classList.remove('reading')
    table.style.removeProperty('--tail')
    table.style.removeProperty('zoom')

    const room = scroll.clientWidth
    const natural = table.scrollWidth
    const whole = natural <= room + 1
    onFits?.(whole)

    /*
     * Shrunk to fit, and never magnified: a card already inside the room it has is
     * already the size it was written at, and blowing it up would say the screen is
     * smaller than it is.
     */
    if (fit) {
      table.style.zoom = Math.min(1, room / natural)
      box.classList.remove('reading')
      places.hidden = true
      for (const cell of table.querySelectorAll('.holds > .step')) cell.style.removeProperty('left')
      stops = [0]
      return
    }

    box.classList.toggle('reading', !whole)
    places.hidden = whole
    if (whole) {
      for (const cell of table.querySelectorAll('.holds > .step')) cell.style.removeProperty('left')
      stops = [0]
      return
    }

    // What the Done place is measured from, and the room left after it for the last
    // step to be scrolled into. The step columns are capped in the stylesheet at the
    // same 240px the table takes when it fits; they used to be capped at this width
    // instead, which tied every column to how wide the ingredient names happened to be.
    const lead = table.querySelector('.heading')?.getBoundingClientRect().width ?? 0
    table.style.setProperty('--tail', Math.max(0, room - lead) + 'px')

    const widths = getComputedStyle(table).gridTemplateColumns.split(' ').map(Number.parseFloat)
    const stepWidth = (column) => widths[2 + column] || 0

    /*
     * The last column an ingredient is still waiting in. Up to there the Done place has
     * to be a whole ingredient block wide, because one may be standing in it; past there
     * nothing wide is left and it can be no wider than the step itself, which pulls the
     * rest of the card leftwards instead of leaving a lane of nothing.
     */
    let held = 0
    for (const slot of table.querySelectorAll('.hold')) {
      const span = Number(slot.style.gridArea.split('span').pop())
      held = Math.max(held, span - 2)
    }

    doneAt = (column) => (column < held ? lead : stepWidth(column) || lead)

    /*
     * Every cell holds where its right edge meets the Done line, not where its left edge
     * meets the screen. Once the line has closed up to the width of the step itself that
     * is the same as holding at the left, which is why the later ones sit at nought.
     */
    for (const slot of table.querySelectorAll('.holds')) {
      const column = Number(slot.style.gridArea.split('/')[1]) - 3
      const cell = slot.firstElementChild
      if (cell) cell.style.left = Math.max(0, doneAt(column) - stepWidth(column)) + 'px'
    }

    // A stop for each column, at the scroll that brings its right edge to the line.
    stops = [0]
    let run = 0
    for (let column = 1; column <= countOf(table); column++) {
      run += stepWidth(column)
      stops.push(Math.max(0, lead + run - doneAt(column)))
    }

    dress(place())
  }

  /** The three places, measured from the stop the card is settling on. */
  const dress = (index) => {
    const widths = getComputedStyle(table).gridTemplateColumns.split(' ').map(Number.parseFloat)
    const here = doneAt(index)
    // The track after the last step is the tail, which is blank room rather than a step,
    // so at the last stop there is nothing to be doing and Next has the rest.
    const next = index >= countOf(table) ? 0 : widths[3 + index] || 0
    done.style.width = here + 'px'
    now.style.width = next + 'px'
    nextPlace.style.width = Math.max(0, scroll.clientWidth - here - next) + 'px'
  }

  /** The stop the table is nearest, which is the one it is treated as standing on. */
  const place = () => {
    let best = 0
    for (let index = 1; index < stops.length; index++)
      if (Math.abs(stops[index] - scroll.scrollLeft) < Math.abs(stops[best] - scroll.scrollLeft))
        best = index
    return best
  }

  const glide = (index) => {
    const want = Math.max(0, Math.min(stops.length - 1, index))
    scroll.scrollTo({ left: stops[want], behavior: 'smooth' })
    // Measured from the stop being settled on, not from the scroll, which is still
    // moving and would have the places disagree with the table for a moment.
    dress(want)
    onAt?.(want)
  }

  /*
   * Two gestures, and both end on an edge. Dragging follows the finger and settles on
   * the nearest stop; a flick is worth exactly one step however far it travelled, which
   * is the one movement a cook makes over and over.
   */
  let from = 0
  let began = 0
  let base = 0
  let dragging = false
  let pointer = null

  scroll.addEventListener('pointerdown', (event) => {
    if (!box.classList.contains('reading') || event.button > 0) return
    pointer = event.pointerId
    from = event.clientX
    began = Date.now()
    base = scroll.scrollLeft
    dragging = false
  })

  scroll.addEventListener('pointermove', (event) => {
    if (pointer === null || event.pointerId !== pointer) return
    const moved = event.clientX - from
    if (!dragging) {
      if (Math.abs(moved) < 6) return
      dragging = true
      scroll.setPointerCapture?.(pointer)
    }
    event.preventDefault()
    scroll.scrollLeft = base - moved
  })

  const release = (event) => {
    if (pointer === null) return
    const moved = dragging && event ? event.clientX - from : 0
    const was = dragging
    pointer = null
    dragging = false
    if (!was) return
    const speed = Math.abs(moved) / Math.max(1, Date.now() - began)
    if (speed > 0.5 && Math.abs(moved) > 18) {
      let standing = 0
      for (let index = 0; index < stops.length; index++) if (stops[index] <= base + 1) standing = index
      glide(standing + (moved < 0 ? 1 : -1))
    } else glide(place())
  }

  scroll.addEventListener('pointerup', release)
  scroll.addEventListener('pointercancel', () => { pointer = null; dragging = false })

  // A trackpad scrolls freely and settles when the hand stops, so the edges grip there too.
  let resting = null
  scroll.addEventListener('scroll', () => {
    if (pointer !== null || !box.classList.contains('reading')) return
    clearTimeout(resting)
    resting = setTimeout(() => glide(place()), 140)
  }, { passive: true })

  requestAnimationFrame(() => {
    settle()
    if (at > 0 && stops[at] !== undefined) scroll.scrollLeft = stops[at]
  })
  /* A card is drawn afresh on every scale, every source, every step back from the editor,
     and the old view is thrown away without being told. Being out of the document is what
     being replaced looks like from here, so that is when this one lets go of the window. */
  const onResize = () => {
    if (!table.isConnected) return window.removeEventListener('resize', onResize)
    settle()
  }
  window.addEventListener('resize', onResize)

  return box
}

function countOf(table) {
  return Number(table.style.getPropertyValue('--columns')) || 0
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
