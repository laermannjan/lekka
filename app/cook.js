import { gather, phrase, stepsOf } from './recipe.js'
import { t } from './i18n.js'
import { arcOffset, before, divider, element, icon, menuItem, overview, picture, ring, roundButton, said, slide, uses } from './ui.js'

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
 * The cook screen: the recipe's own list, walked through. The step done last fades out
 * above, the one to do now stands large, what it takes listed under it, and the next few
 * wait below - so where you are is never lost, and what comes is never a surprise.
 * Timers left running on other steps stand at the top, and lead back to their step. On a
 * wide screen every step stands down the side instead, with its timer, a click from it.
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

  const next = element('button', 'primary', undefined, [
    element('span', '', after ? t('Next: {step}', { step: after.title }) : t('Done cooking')),
    icon('down', 18),
  ])
  next.type = 'button'
  next.onclick = after ? () => go(at + 1) : on.end
  const previous = roundButton('up', t('Previous step'), () => go(at - 1))
  previous.disabled = at === 1

  const elsewhere = Object.entries(session.timers)
    .filter(([n]) => Number(n) !== at)
    .sort(([, a], [, b]) => a.ends - b.ends)

  const list = element(
    'nav',
    'steps',
    undefined,
    steps.map((one) => {
      const button = element('button', one.n === at ? 'here' : one.n < at ? 'past' : '', undefined, [
        element('span', 'n', String(one.n)),
        element('span', 'title', one.title),
        session.timers[one.n] ? clockOf(session.timers[one.n], 'clock-small') : null,
      ])
      button.type = 'button'
      button.onclick = () => go(one.n)
      if (one.n === at) button.setAttribute('aria-current', 'step')
      return button
    }),
  )
  list.setAttribute('aria-label', t('Steps'))

  return [
    list,
    element('div', 'bar', undefined, [
      roundButton('down', t('Back to the recipe'), on.minimise),
      element('span', 'middle', undefined, [
        element('span', 'name', card.title),
        element('span', 'count', t('Step {n} of {count}', { n: at, count: steps.length })),
      ]),
      roundButton('more', t('All ingredients, or end cooking'), () => cookMenu(card, session, on)),
    ]),
    elsewhere.length
      ? element('div', 'banners', undefined, elsewhere.map(([n, one]) => banner(Number(n), one, () => go(Number(n)))))
      : null,
    element('section', 'guide', undefined, [
      at === 1 && card.preparations.length ? before(card.preparations) : null,
      at > 1
        ? element('div', 'done', undefined, [icon('check', 16), element('span', 'title', steps[at - 2].title)])
        : null,
      element('article', 'now', undefined, [
        divider(at),
        element('p', 'sentence', undefined, said(phrase(step))),
        step.time ? timerControl(step, timer, timer ? stopTimer : startTimer) : null,
        step.ingredients.length ? uses(step.ingredients, session.factor) : null,
      ]),
      ...steps.slice(at, at + 3).map((one) => element('div', 'later', undefined, [divider(one.n), element('p', 'title', one.title)])),
    ]),
    element('div', 'foot', undefined, [previous, next]),
  ]
}

/** A step's timer: a button that starts it, then the time left and a button to stop it. */
function timerControl(step, timer, toggle) {
  if (!timer) {
    const start = element('button', 'timer-start', undefined, [icon('play', 16), t('Start {time} timer', { time: step.time.text })])
    start.type = 'button'
    start.onclick = toggle
    return start
  }
  const stop = element('button', 'timer-stop', undefined, [ring(timer, 52), icon('stop', 16)])
  stop.type = 'button'
  stop.setAttribute('aria-label', t('Stop the timer'))
  stop.onclick = toggle
  return element('div', 'timer-run', undefined, [clockOf(timer, 'clock'), stop])
}

/** What is left of a timer, counting down on its own from the moment it ends. */
function clockOf(timer, className) {
  const clock = element('span', className, countdown((timer.ends - Date.now()) / 1000))
  clock.dataset.ends = String(timer.ends)
  clock.classList.toggle('over', timer.ends <= Date.now())
  return clock
}

/** A timer running on another step: what it is, what is left, and a tap back to it. */
function banner(n, timer, open) {
  const button = element('button', 'banner', undefined, [icon('timer', 18), element('span', 'name', t('{title} · step {n}', { title: timer.title, n })), clockOf(timer, 'clock-small')])
  button.type = 'button'
  button.setAttribute('aria-label', t('{title} timer, step {n}: back to it', { title: timer.title, n }))
  button.onclick = open
  return button
}

function cookMenu(card, session, on) {
  const sheet = slide(
    element('h2', '', card.title),
    element('div', 'menu', undefined, [
      menuItem('list', t('All ingredients'), () => {
        sheet.close()
        slide(element('h2', '', t('All ingredients')), overview(gather(card), session.factor))
      }),
      menuItem(
        'close',
        t('End cooking'),
        () => {
          sheet.close()
          on.end()
        },
        'danger',
      ),
    ]),
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

  const sub = element('span', 'sub', `${t('Step {n}', { n: session.at })}${step ? ` · ${step.title}` : ''}`)
  if (soonest) sub.append(' · ', clockOf(soonest, 'clock-small'))

  const link = element('a', 'mini glass', undefined, [
    picture(card ?? { title: session.title }, 'round-picture'),
    element('span', 'text', undefined, [element('span', 'main', session.title), sub]),
    soonest ? ring(soonest) : icon('up', 22),
  ])
  link.href = `/cook/${session.id}`
  link.setAttribute('aria-label', t('Cooking {title}, step {n}', { title: session.title, n: session.at }))
  link.onclick = (event) => {
    event.preventDefault()
    open()
  }
  return link
}

/** `2:41:07`, `04:59`, and `Done` once it has run out. */
export function countdown(seconds) {
  const left = Math.ceil(seconds)
  if (left <= 0) return t('Done')
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
