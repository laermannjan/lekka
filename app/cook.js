import { stepsOf } from './recipe.js'
import { arcOffset, element, icon, menuItem, picture, ring, roundButton, slide, uses } from './ui.js'

/**
 * Cooking: one recipe at a time, a step at a time, with its timers.
 *
 * What is being cooked is kept on this device and nowhere else - which recipe, which
 * step, how much of it, and when each timer ends. A timer is the moment it ends rather
 * than a count, so it is right again the moment the screen is back, however long the
 * phone slept in between.
 */
const KEY = 'lekka.cooking'

export function cooking() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? null
  } catch {
    return null
  }
}

export function keep(session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(session))
  } catch {
    // A browser that keeps nothing still cooks; it only forgets on reload.
  }
  return session
}

export function stop() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing kept, nothing to drop.
  }
}

export function begin(id, card, factor) {
  return keep({ id, title: card.title, factor, at: 1, timers: {} })
}

/**
 * The cook screen: what to do now, large enough to read from the stove, and the way on.
 * The step is the biggest thing on it; the heat and the time it needs stand beside each
 * other as numbers; what goes in is a column of amounts. Timers left running on other
 * steps wait above the buttons, and lead back to their step.
 *
 * `on` holds what it cannot do itself: `minimise`, `end`, and `redraw`, which is handed
 * the session as it should be next.
 */
export function renderCook(card, session, on) {
  const steps = stepsOf(card)
  const at = Math.min(Math.max(session.at, 1), steps.length)
  const step = steps[at - 1]
  const after = steps[at]
  const timer = session.timers[at] ?? null
  const { title, heat } = heatOf(step)

  const go = (n) => on.redraw({ ...session, at: n })
  const startTimer = () => {
    sound()
    on.redraw({
      ...session,
      timers: { ...session.timers, [at]: { ends: Date.now() + step.time.from * 1000, total: step.time.from, title: step.title } },
    })
  }
  const stopTimer = () => {
    const timers = { ...session.timers }
    delete timers[at]
    on.redraw({ ...session, timers })
  }

  const next = element('button', 'primary', after ? `Next: ${after.title}` : 'Done')
  next.type = 'button'
  next.onclick = after ? () => go(at + 1) : on.end

  const previous = roundButton('back', 'Previous step', () => go(at - 1))
  previous.disabled = at === 1

  const elsewhere = Object.entries(session.timers)
    .filter(([n]) => Number(n) !== at)
    .sort(([, a], [, b]) => a.ends - b.ends)

  return [
    element('div', 'bar', undefined, [
      roundButton('down', 'Back to the recipe', on.minimise),
      element('span', 'middle', `Step ${at} of ${steps.length}`),
      roundButton('more', 'All ingredients, or end cooking', () => cookMenu(card, session, on)),
    ]),
    element('section', 'now', undefined, [
      element('div', '', undefined, [element('h1', '', title), step.aside ? element('p', 'aside', step.aside) : null]),
      heat || step.time
        ? element('div', 'facts', undefined, [
            heat ? fact('Heat', heat) : null,
            step.time ? timerFact(step, timer, timer ? stopTimer : startTimer) : null,
          ])
        : null,
      step.ingredients.length ? uses(step.ingredients, session.factor) : null,
    ]),
    element('div', 'foot', undefined, [
      elsewhere.length
        ? element('div', 'others', undefined, elsewhere.map(([n, one]) => chip(Number(n), one, () => go(Number(n)))))
        : null,
      element('div', 'controls', undefined, [previous, next]),
    ]),
  ]
}

/**
 * `Backen 150 °C` is `Backen`, with 150 °C shown on its own beside the timer. Only a heat
 * that ends the words: `Ofen auf 150 °C vorheizen` says nothing without it.
 */
export function heatOf(step) {
  const match = /\s+\d+(?:[.,]\d+)?\s*°\s*[CF]$/.exec(step.title)
  return match ? { title: step.title.slice(0, match.index), heat: step.temperature } : { title: step.title, heat: null }
}

function fact(label, value) {
  return element('div', 'fact', undefined, [element('span', 'label', label), element('span', 'value', value)])
}

/** The tile is the button: a tap anywhere on it starts the timer, and stops it again. */
function timerFact(step, timer, toggle) {
  const clock = element('span', 'value clock', countdown(timer ? (timer.ends - Date.now()) / 1000 : step.time.from))
  if (timer) clock.dataset.ends = String(timer.ends)
  clock.classList.toggle('over', Boolean(timer) && timer.ends <= Date.now())
  const ranged = step.time.from !== step.time.to
  const button = element('button', timer ? 'fact timer running' : 'fact timer', undefined, [
    element('span', 'head', undefined, [
      element('span', 'label', ranged ? `Timer · ${step.time.text}` : 'Timer'),
      element('span', 'go', undefined, [timer ? ring(timer, 34) : null, icon(timer ? 'stop' : 'play', 16)]),
    ]),
    clock,
  ])
  button.type = 'button'
  button.setAttribute('aria-label', timer ? 'Stop the timer' : `Start a timer for ${step.time.text}`)
  button.onclick = toggle
  return button
}

/** A timer running on another step: its name and what is left, and a tap back to it. */
function chip(n, timer, open) {
  const clock = element('span', 'clock-small', countdown((timer.ends - Date.now()) / 1000))
  clock.dataset.ends = String(timer.ends)
  clock.classList.toggle('over', timer.ends <= Date.now())
  const button = element('button', 'chip glass', undefined, [ring(timer, 22), element('span', 'name', timer.title), clock])
  button.type = 'button'
  button.setAttribute('aria-label', `${timer.title}, step ${n}: back to it`)
  button.onclick = open
  return button
}

function cookMenu(card, session, on) {
  const sheet = slide(
    element('h2', '', card.title),
    element('div', 'menu', undefined, [
      menuItem('list', 'All ingredients', () => {
        sheet.close()
        ingredientsSheet(card, session)
      }),
      menuItem(
        'close',
        'End cooking',
        () => {
          sheet.close()
          on.end()
        },
        'danger',
      ),
    ]),
  )
}

function ingredientsSheet(card, session) {
  slide(
    element('h2', '', 'All ingredients'),
    uses(
      stepsOf(card)
        .filter((step) => step.ingredients.length)
        .flatMap((step) => [`${step.n} · ${step.title}`, ...step.ingredients]),
      session.factor,
    ),
  )
}

/**
 * Over every screen but the cook screen, while something is cooking: what it is, where
 * you are in it, and the timer that ends first. Tapping it goes back in.
 */
export function miniBar(session, card, open) {
  const steps = card ? stepsOf(card) : []
  const step = steps[session.at - 1]
  const soonest = Object.values(session.timers).sort((a, b) => a.ends - b.ends)[0] ?? null

  const sub = element('span', 'sub', `Step ${session.at}${step ? ` · ${step.title}` : ''}`)
  if (soonest) {
    const clock = element('span', 'clock-small', countdown((soonest.ends - Date.now()) / 1000))
    clock.dataset.ends = String(soonest.ends)
    clock.classList.toggle('over', soonest.ends <= Date.now())
    sub.append(' · ', clock)
  }

  const link = element('a', 'mini glass', undefined, [
    picture(card ?? { title: session.title }, 'round-picture'),
    element('span', 'text', undefined, [element('span', 'main', session.title), sub]),
    soonest ? ring(soonest) : icon('up', 22),
  ])
  link.href = `/cook/${session.id}`
  link.setAttribute('aria-label', `Cooking ${session.title}, step ${session.at}`)
  link.onclick = (event) => {
    event.preventDefault()
    open()
  }
  return link
}

/** `2:41:07`, `04:59`, and `Done` once it has run out. */
export function countdown(seconds) {
  const left = Math.ceil(seconds)
  if (left <= 0) return 'Done'
  const h = Math.floor(left / 3600)
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, '0')
  const s = String(left % 60).padStart(2, '0')
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`
}

/**
 * Once a second: every clock on the screen counts down from the moment it ends, and a
 * timer that has just run out rings - once on the minute, until it is stopped.
 */
export function tick() {
  for (const node of document.querySelectorAll('[data-ends]')) {
    const ends = Number(node.dataset.ends)
    const total = Number(node.dataset.total)
    if (node.classList.contains('arc')) node.setAttribute('stroke-dashoffset', arcOffset(ends, total))
    else {
      node.textContent = countdown((ends - Date.now()) / 1000)
      node.classList.toggle('over', ends <= Date.now())
    }
  }

  const session = cooking()
  if (!session) return
  let rang = false
  for (const timer of Object.values(session.timers)) {
    const over = Date.now() - timer.ends
    if (over < 0) continue
    // Rung when it runs out, and again each minute after, for five minutes at most.
    const due = Math.floor(over / 60000)
    if (due <= 5 && (timer.rung ?? -1) < due) {
      timer.rung = due
      rang = true
    }
  }
  if (rang) {
    keep(session)
    sound(true)
  }
}

let context = null

/**
 * A phone plays sound only once a person has asked for something, so the first press of
 * `Start timer` wakes the sound up, silently, and the alarm can ring later on its own.
 */
function sound(ring = false) {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') context.resume()
    if (!ring) return
    for (const at of [0, 0.35, 0.7]) {
      const tone = context.createOscillator()
      const level = context.createGain()
      tone.frequency.value = 880
      level.gain.setValueAtTime(0.0001, context.currentTime + at)
      level.gain.exponentialRampToValueAtTime(0.4, context.currentTime + at + 0.02)
      level.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + at + 0.25)
      tone.connect(level).connect(context.destination)
      tone.start(context.currentTime + at)
      tone.stop(context.currentTime + at + 0.3)
    }
  } catch {
    // No sound to be had; the clock still says Done.
  }
}

let wake = null

/** The screen stays on while the cook screen is up, and again after the phone comes back. */
export async function stayAwake(on) {
  try {
    if (!on) {
      await wake?.release()
      wake = null
      return
    }
    if (document.visibilityState === 'visible' && !wake) {
      wake = await navigator.wakeLock?.request('screen')
      wake?.addEventListener('release', () => (wake = null))
    }
  } catch {
    // Refused, or not here: the screen sleeps as it always did.
  }
}
