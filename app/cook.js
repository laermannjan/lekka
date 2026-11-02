import { formatAmount, scaleAmount } from './amount.js'
import { stepsOf } from './recipe.js'
import { element, icon, picture, roundButton, slide } from './ui.js'

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
 * The cook screen. `on` holds what it cannot do itself: `minimise`, `end`, and `redraw`,
 * which is handed the session as it should be next.
 */
export function renderCook(card, session, on) {
  const steps = stepsOf(card)
  const at = Math.min(Math.max(session.at, 1), steps.length)
  const step = steps[at - 1]
  const after = steps[at]
  const timer = session.timers[at] ?? null

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

  let primary
  if (step.time && !timer) primary = { text: `Start timer · ${step.time.text}`, run: startTimer }
  else if (after) primary = { text: `Next · ${after.title}`, run: () => go(at + 1) }
  else primary = { text: 'Done', run: on.end }

  const main = element('button', 'primary', primary.text)
  main.type = 'button'
  main.onclick = primary.run

  const previous = roundButton('back', 'Previous step', () => go(at - 1))
  previous.disabled = at === 1

  const end = element('button', 'pill glass', 'End')
  end.type = 'button'
  end.onclick = on.end

  const running = Object.keys(session.timers).length
  return [
    element('div', 'bar', undefined, [roundButton('down', 'Back to the recipe', on.minimise), end]),
    element('section', 'cook-card', undefined, [
      element('h1', '', step.title),
      step.aside ? element('p', 'aside', step.aside) : null,
      step.ingredients.length
        ? element('div', 'uses', undefined, step.ingredients.map((node) => use(node, session.factor)))
        : null,
      step.time ? timerBlock(step, timer, stopTimer) : null,
      element('p', 'then', after ? `Then: ${after.title}${after.aside ? `, ${after.aside}` : ''}` : 'Then: done.'),
    ]),
    element('div', 'progress', undefined, [
      element('div', 'words', undefined, [
        element('span', '', `Step ${at} of ${steps.length}`),
        element('span', 'quiet', at === steps.length ? 'Last step' : `${steps.length - at} to go`),
      ]),
      track((at - 1) / steps.length),
    ]),
    element('div', 'controls', undefined, [previous, main]),
    element('div', 'tools', undefined, [
      tool('timer', running ? `Timers · ${running}` : 'Timers', () => timersSheet(session, on)),
      tool('list', 'All ingredients', () => ingredientsSheet(card, session)),
    ]),
  ]
}

function use(node, factor) {
  const name = element('span', 'name', node.name)
  if (node.aside) name.append(' ', element('span', 'quiet', node.aside))
  return element('div', 'use', undefined, [name, element('span', 'amount', formatAmount(scaleAmount(node.amount, factor)))])
}

function timerBlock(step, timer, stopTimer) {
  const clock = element('span', 'clock', countdown(timer ? (timer.ends - Date.now()) / 1000 : step.time.from))
  const fill = element('span', 'fill')
  fill.style.width = '0%'
  if (timer) {
    clock.dataset.ends = String(timer.ends)
    fill.dataset.ends = String(timer.ends)
    fill.dataset.total = String(timer.total)
  }
  const row = element('div', 'row', undefined, [clock])
  if (timer) {
    const button = element('button', 'pill glass', 'Stop')
    button.type = 'button'
    button.onclick = stopTimer
    row.append(button)
  }
  return element('div', 'timer', undefined, [
    row,
    element('span', 'track', undefined, [fill]),
    element('span', 'quiet', timer ? `of ${step.time.text}` : `${step.time.text}, not started`),
  ])
}

function track(part) {
  const fill = element('span', 'fill')
  fill.style.width = `${Math.round(part * 100)}%`
  return element('span', 'track', undefined, [fill])
}

function tool(name, text, run) {
  const button = element('button', 'tool', undefined, [icon(name, 24), element('span', '', text)])
  button.type = 'button'
  button.onclick = run
  return button
}

function timersSheet(session, on) {
  const entries = Object.entries(session.timers).sort(([, a], [, b]) => a.ends - b.ends)
  const sheet = slide(
    element('h2', '', 'Timers'),
    entries.length
      ? element(
          'div',
          'menu',
          undefined,
          entries.map(([n, timer]) => {
            const clock = element('span', 'clock-small', countdown((timer.ends - Date.now()) / 1000))
            clock.dataset.ends = String(timer.ends)
            const stopIt = element('button', 'second', 'Stop')
            stopIt.type = 'button'
            stopIt.onclick = () => {
              sheet.close()
              const timers = { ...session.timers }
              delete timers[n]
              on.redraw({ ...session, timers })
            }
            return element('div', 'timer-row', undefined, [
              element('span', 'text', undefined, [element('span', 'main', timer.title), element('span', 'quiet', `Step ${n}`)]),
              clock,
              stopIt,
            ])
          }),
        )
      : element('p', 'hint', 'No timer is running. A step with a time starts one.'),
  )
}

function ingredientsSheet(card, session) {
  slide(
    element('h2', '', 'All ingredients'),
    element(
      'div',
      'menu',
      undefined,
      stepsOf(card)
        .filter((step) => step.ingredients.length)
        .flatMap((step) => [
          element('p', 'label', `Step ${step.n} · ${step.title}`),
          ...step.ingredients.map((node) => use(node, session.factor)),
        ]),
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

function ring(timer) {
  const holder = element('span', 'ring')
  holder.innerHTML =
    '<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="12" fill="none" stroke="currentColor" stroke-opacity="0.18" stroke-width="3.5"/><circle class="arc" cx="15" cy="15" r="12" fill="none" stroke="var(--tint)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="75.4" transform="rotate(-90 15 15)"/></svg>'
  const arc = holder.querySelector('.arc')
  arc.dataset.ends = String(timer.ends)
  arc.dataset.total = String(timer.total)
  arc.setAttribute('stroke-dashoffset', String(arcOffset(timer.ends, timer.total)))
  return holder
}

function arcOffset(ends, total) {
  const left = Math.max(0, (ends - Date.now()) / 1000)
  return (75.4 * (1 - left / total)).toFixed(1)
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
    if (node.classList.contains('fill')) node.style.width = `${Math.min(100, Math.round((1 - Math.max(0, ends - Date.now()) / 1000 / total) * 100))}%`
    else if (node.classList.contains('arc')) node.setAttribute('stroke-dashoffset', arcOffset(ends, total))
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
