import { parseCard, ParseError } from './card.js'
import { renderReading } from './read.js'
import { renderOverview } from './overview.js'
import * as api from './api.js'
import { toDraft } from './edit.js'
import { buildEditor } from './editor.js'
import { section, specification } from './page.js'
import { devices as renderDevices, firstPerson as firstPersonForm, signIn as signInForm } from './door.js'
import { address, arrive } from './link.js'

const SCALES = [
  [0.5, '½×'],
  [1, '1×'],
  [1.5, '1½×'],
  [2, '2×'],
]

const acts = document.getElementById('acts')
const screen = document.getElementById('screen')
const where = document.getElementById('where')

boot()
register()

/**
 * One question before the first screen: is there a door, and are we through it. It is
 * asked once, and a server too old or too busy to answer is treated as having none -
 * the first real request then says what is wrong, which it would have anyway.
 */
async function boot() {
  instance = await api.me().catch(() => instance)
  return start()
}

/**
 * What this instance is and who we are on it. Asked once on load; `NONE` answers that
 * there is no door, and every screen below then behaves as it always has.
 */
let instance = { mode: 'NONE', empty: false, person: null, session: null }

async function start() {
  const here = arrive()

  if (instance.mode !== 'NONE' && !instance.person) {
    // The address is left alone, so whatever link brought you here opens the moment you
    // are through the door.
    if (instance.empty) return showFirstPerson(joining())
    return showSignIn()
  }

  if (here.kind === 'card') return showCard(here.id, here.token)

  // The foot says `/new` while a fresh recipe is being written, so the address has to
  // mean it: without this, opening it lands on the overview under a foot saying `/new`.
  if (here.path === '/new') return showWriting()

  if (here.path === '/devices') return showDevices()

  return showOverview()
}

/** The operator's one-time link, carried in the fragment so it reaches no log. */
function joining() {
  if (location.pathname !== '/join') return null
  return location.hash.length > 1 ? location.hash.slice(1) : null
}

function showSignIn(message = null) {
  page('/')
  show(
    message ? band(message, 'warning') : null,
    section('Sign in'),
    signInForm({
      onSignIn: async (name, password) => {
        try {
          await api.signIn(name, password)
        } catch (error) {
          return showSignIn(
            error instanceof api.ApiError && error.status === 401
              ? 'That name and password do not match.'
              : reason(error),
          )
        }
        instance = await api.me()
        return start()
      },
    }),
  )
}

function showFirstPerson(token) {
  page(location.pathname)
  if (!token)
    return show(
      section('Sign in'),
      band('Nobody has signed in here yet. The link that makes the first person is in the server’s log.', 'warning'),
    )

  show(
    section('First person'),
    firstPersonForm({
      token,
      onCreate: async (name, password) => {
        try {
          await api.firstPerson(name, password, token)
        } catch (error) {
          showFirstPerson(token)
          return notice(reason(error))
        }
        instance = await api.me()
        history.replaceState(null, '', '/')
        return start()
      },
    }),
  )
}

async function showDevices() {
  page('/devices', recipesAction())
  const list = await attempt(() => api.sessions(), 'The list did not load.')
  if (list === FAILED) return

  show(
    section('Devices'),
    renderDevices(list, instance.session, {
      onRevoke: async (id) => {
        if (await attempt(() => api.revokeSession(id), 'It was not revoked.') === FAILED) return
        showDevices()
      },
      onSignOut: async () => {
        await api.signOut().catch(() => {})
        instance = { ...instance, person: null, session: null }
        await purge()
        history.replaceState(null, '', '/')
        showSignIn('Signed out.')
      },
    }),
  )
}

/**
 * What this browser keeps of somebody else's recipes, dropped. The app shell is left in
 * place so lekka still opens without a network; only what was read through the door goes.
 * It cannot reach a copy already saved elsewhere on the machine, and the screens say so.
 */
async function purge() {
  if (!globalThis.caches) return
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        const { pathname } = new URL(request.url)
        if (pathname.startsWith('/api/') || pathname.startsWith('/r/')) await cache.delete(request)
      }
    }
  } catch {
    // A browser that will not open its caches has nothing for us to clear.
  }
}

/**
 * The session ended somewhere else - another browser's Revoke, or a restart. Say so once,
 * and keep nothing that was read through the door.
 */
async function locked() {
  instance = { ...instance, person: null, session: null }
  await purge()
  showSignIn('You were signed out.')
}

async function showOverview() {
  page('/', whoAction())

  let list
  try {
    list = await api.cards()
  } catch (error) {
    if (error instanceof api.ApiError && error.status === 401) return locked()
    return show(section('Recipes'), band(`The library did not load. ${reason(error)}`, 'warning'))
  }

  show(
    section('Recipes'),
    renderOverview(await describe(list), {
      onDelete: (id, card) => erase(id, card),
      onImport: () => showImport(),
      onCreate: () => showWriting(),
    }),
  )
}

/**
 * Your own name in the masthead, and the way to the browsers signed in as you. Absent on
 * an instance with no access control, where there is nobody to be.
 */
function whoAction() {
  if (!instance.person) return null
  const button = element('button', 'quiet', instance.person.name)
  // `replaceState`, as everywhere else here: the app has no `popstate` handler, so a
  // pushed entry would let Back change the address and leave this screen standing.
  button.onclick = () => {
    history.replaceState(null, '', '/devices')
    showDevices()
  }
  return button
}

/** The way off the devices screen, since the address it sits at is not a recipe. */
function recipesAction() {
  const button = element('button', 'quiet', 'Recipes')
  button.onclick = () => {
    history.replaceState(null, '', '/')
    showOverview()
  }
  return button
}

async function showCard(id, token, state = {}) {
  const { scale = 1, at = 0, fit = false } = state
  const here = { scale, at, fit }

  const text = await load(id, token)
  if (text === null) return fail('No recipe under this link.')

  let card
  try {
    card = parseCard(text)
  } catch (error) {
    if (!(error instanceof ParseError)) throw error
    return fail(`Line ${error.line}: ${error.message}`)
  }

  const fitting = fitter(id, token, here)

  /*
   * No row of controls above the table, and none below it but the acts.
   *
   * The scale and the fit are in the masthead. Neither is about a point in the recipe -
   * one multiplies every amount on it, the other decides how the page draws the whole
   * thing - so they belong where the page's own controls are.
   *
   * They were a bar between the heading and the table, which was the right instinct in
   * the wrong place: writing has nothing to put there, so the table rose by the height
   * of that row the moment `Edit` was pressed - out from under the pointer that pressed
   * it. The scale then went into the heading cell of the ingredient column, which is
   * nearer still to what it changes - but that cell is held at the left edge while the
   * card rolls, so the switch was dragged out over the middle of the table.
   */
  page(`/r/${id}`, scales(id, token, here), fitting.button)
  show(
    section(card.title, card.yields),
    body(card, id, token, here, fitting.tell),
    // What changes the recipe itself sits past it, out of the way of reading.
    after(composer(id, token, card)),
    specification(card),
  )
}

function body(card, id, token, state, onFits) {
  // Reading is a scroll, not a redraw: the place is only kept so that changing the scale
  // comes back to the step the cook was standing on.
  return renderReading(card, state.scale, state.at, {
    fit: state.fit,
    onFits,
    onAt: (at) => {
      state.at = at
    },
  })
}

/**
 * The whole table at once, or the size it was written at. A recipe wider than the screen
 * can be read a step at a time or shrunk until it fits, and those are the two answers
 * there are: one keeps the type and gives up seeing it all, the other keeps the card and
 * gives up the type. So it is one button that swaps between them.
 *
 * It says what it will do rather than what is set, the way every switchable control here
 * does, and it is not offered at all on a recipe that already fits - there would be
 * nothing for it to do, and a control that does nothing is worse than no control.
 */
function fitter(id, token, state) {
  const button = element('button', 'quiet', state.fit ? 'Actual size' : 'Fit to screen')
  button.onclick = () => showCard(id, token, { ...state, fit: !state.fit })
  button.hidden = true
  return {
    button,
    // A recipe drawn whole needs no fitting; one already fitted needs the way back.
    tell: (whole) => {
      button.hidden = whole && !state.fit
    },
  }
}

/**
 * Offered on every recipe you can see. Whether the write lands is the server's to say,
 * and it says so by refusing - which the editor reports in place. A button hidden on a
 * guess would be worse: under `GRANT` the answer depends on a row this browser cannot read.
 */
function composer(id, token, card) {
  const button = element('button', 'quiet', 'Edit')
  button.onclick = () => showEditor(id, token, toDraft(card))
  return button
}

/**
 * The editor holds the draft, so the screen is built once and repaints itself. Coming
 * back out re-reads the recipe from the server, which is the only copy that counts.
 *
 * A recipe being written for the first time has no id yet. It is made on the first save
 * and not before: `Create` opens an empty editor with the name waiting, and a recipe
 * nobody finished writing never reaches the server at all.
 */
function showEditor(id, token, draft) {
  /*
   * The masthead is cleared, because what was on it belongs to the recipe being read.
   * `show` replaces the screen and not the masthead, so the scale and `Fit to screen`
   * outlived the view they were put there by - and both answer with `showCard`, which
   * re-reads the recipe from the server. Pressing one while writing threw the draft away
   * without so much as asking, which is the one thing `Cancel` exists to prevent.
   */
  page(id ? `/r/${id}` : '/new')

  show(
    buildEditor({
      draft,
      onClose: () => (id ? showCard(id, token) : showOverview()),
      onSave: async (text) => {
        if (id) {
          try {
            await api.writeCard(id, text, token)
          } catch (error) {
            return `Not saved. ${reason(error)}`
          }
          return null
        }

        let made
        try {
          made = await api.createCard(text)
        } catch (error) {
          return `Not saved. ${reason(error)}`
        }
        id = made.id
        history.replaceState(null, '', address(id))
        page(`/r/${id}`)
        return null
      },
    }),
  )
}

/**
 * A recipe, or null. There is no copy kept here: the service worker already caches every
 * successful GET and serves it when the network is gone, and a second copy in local
 * storage was the same bytes in a place nothing else could clear.
 */
async function load(id, token) {
  return api.readCard(id, token).catch(() => null)
}

async function describe(list) {
  return Promise.all(
    list.map(async (row) => {
      const text = await load(row.id)
      try {
        return { ...row, card: text === null ? null : parseCard(text) }
      } catch {
        return { ...row, card: null }
      }
    }),
  )
}

/**
 * A recipe made here, rather than brought in. It starts empty in the editor with its
 * name waiting: a name is one word, and a whole screen to collect one word is a screen
 * the editor can collect it in.
 */
function showWriting() {
  // The foot says `/new`, so the address bar has to as well - and a reload has to land
  // back here, which is what the route in `start` is for. Replaced rather than pushed:
  // nothing else in this app pushes, and a Back that walked into a draft with no
  // history to answer it would be worse than one that leaves the page.
  history.replaceState(null, '', '/new')
  page('/new')
  showEditor(null, null, {
    title: '',
    yields: null,
    notes: [],
    preparations: [],
    strands: [],
  })
}

/**
 * A recipe that exists somewhere already. It is read exactly as a stored one is, so
 * anything the format accepts comes in whole and anything it does not is reported by
 * line, in the place the line is.
 */
function showImport() {
  const box = element('dialog', 'compose')
  const form = element('form', 'body')
  form.method = 'dialog'

  const heading = element('h2', 'heading', 'Import a recipe')
  heading.id = 'import-title'
  box.setAttribute('aria-labelledby', heading.id)

  const area = element('textarea')
  area.rows = 9
  area.spellcheck = false
  area.placeholder = '# Pfannkuchen (12 Stück)\n\n- braten (2 min je Seite)\n  - verrühren\n    - Mehl: 250 g'

  const field = element('label', 'row wide', undefined, [
    element('span', 'name', 'Text'),
    area,
    element('span', 'hint', 'Paste a recipe. Anything the format accepts is read whole.'),
  ])

  const wrong = element('span', 'hint warn')
  wrong.hidden = true

  const take = element('button', 'go', 'Import')
  take.type = 'submit'

  const cancel = element('button', 'quiet', 'Cancel')
  cancel.type = 'button'
  cancel.onclick = () => box.close()

  form.onsubmit = async (event) => {
    event.preventDefault()
    try {
      parseCard(area.value)
    } catch (error) {
      if (!(error instanceof ParseError)) throw error
      wrong.textContent = `Line ${error.line}: ${error.message}`
      wrong.hidden = false
      return
    }
    if (take.disabled) return
    take.disabled = true

    const made = await attempt(() => api.createCard(area.value), 'The recipe was not created.')
    if (made === FAILED) return void (take.disabled = false)
    box.close()
    showOverview()
  }

  form.append(heading, field, wrong, element('div', 'actions', undefined, [take, cancel]))
  box.append(form)
  box.onclose = () => box.remove()
  document.body.append(box)
  box.showModal()
  area.focus()
}

const FAILED = Symbol('failed')

/** A write that does not arrive is said out loud, never swallowed. */
async function attempt(work, message) {
  try {
    return await work()
  } catch (error) {
    // Being told to sign in is not a failed write, it is the session having ended
    // somewhere else - on another browser's Revoke, or on a restart. Say so once, and
    // keep nothing that was read through the door.
    if (error instanceof api.ApiError && error.status === 401) {
      await locked()
      return FAILED
    }
    notice(`${message} ${reason(error)}`)
    return FAILED
  }
}

function reason(error) {
  if (error instanceof api.ApiError)
    return error.status === 404 ? 'The link is gone.' : `The server said ${error.status}.`
  if (error instanceof TypeError) return 'No connection.'
  return error.message
}

/** Above whatever is on the screen, so the text the user typed stays where it is. */
function notice(message) {
  screen.prepend(band(message, 'warning'))
}

/** What the masthead and the foot say, which is the same on every screen but one thing. */
function page(path, ...actions) {
  acts.replaceChildren(...actions.filter(Boolean))
  where.textContent = path
}

function fail(message) {
  page(location.pathname)
  show(band(message, 'warning'))
}

function show(...parts) {
  screen.replaceChildren(...parts.filter(Boolean))
}

function band(message, kind = '') {
  return element('div', `band ${kind}`.trim(), message)
}

function after(...parts) {
  const kept = parts.filter(Boolean)
  return kept.length ? element('div', 'bar after', undefined, kept) : null
}

function scales(id, token, state) {
  const group = element('span', 'switch')
  for (const [factor, text] of SCALES) {
    const button = element('button', '', text)
    button.setAttribute('aria-pressed', factor === state.scale)
    button.onclick = () => showCard(id, token, { ...state, scale: factor })
    group.append(button)
  }
  return group
}

/**
 * The worker lives here and not in a tag in the page, because the policy the server sends
 * allows no inline script. Registering fails without a secure context, which plain http gives.
 */
function register() {
  navigator.serviceWorker?.register('/sw.js').catch((error) => console.warn('no worker', error))
}

function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  // A part that is not there is left out. Several of the toolbar's controls answer with
  // nothing on a recipe nobody may change, and `append(null)` writes the word "null".
  node.append(...children.filter(Boolean))
  return node
}
