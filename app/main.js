import { parseCard, ParseError } from './card.js'
import * as api from './api.js'
import { toDraft } from './edit.js'
import { buildEditor } from './editor.js'
import { section } from './page.js'
import {
  devices as renderDevices,
  household as renderHousehold,
  joining as joiningForm,
  signIn as signInForm,
} from './door.js'
import { shareSheet } from './share.js'
import { address, arrive } from './link.js'
import { renderLibrary, renderResults } from './library.js'
import { renderRecipe } from './recipe-page.js'
import { element, icon, roundButton, slide } from './ui.js'

const screen = document.getElementById('screen')
const dock = document.getElementById('dock')

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

/**
 * The library as last read: every recipe with its text, parsed. Search runs over it and
 * a recipe opened from it draws at once. It is read again whenever the list is shown and
 * dropped whenever something is written, so it is never older than the last look.
 */
let library = null

async function start() {
  const here = arrive()

  const link = joinLink()
  if (instance.mode !== 'NONE' && link) return showJoining(link)

  if (instance.mode !== 'NONE' && !instance.person) {
    // The address is left alone, so whatever link brought you here opens the moment you
    // are through the door.
    return showSignIn(instance.empty ? 'first' : null)
  }

  if (here.kind === 'card') return showRecipe(here.id)
  if (here.path === '/new') return showWriting()
  if (here.path === '/devices') return showDevices()
  if (here.path === '/search') return showSearch()
  return showLibrary()
}

/* ---- the library ------------------------------------------------------------ */

async function showLibrary() {
  go('/', { home: true })
  try {
    library = await readLibrary()
  } catch (error) {
    if (error instanceof api.ApiError && error.status === 401) return locked()
    return show(element('h1', 'title', 'Recipes'), notice(`The library did not load. ${reason(error)}`))
  }

  show(...renderLibrary(library, { open: showRecipe, corner: whoButton() }))
  setDock(
    element('div', 'row', undefined, [searchOpener(), roundButton('plus', 'Add a recipe', addSheet)]),
  )
}

async function readLibrary() {
  const rows = await api.cards()
  return rows.map((row) => {
    try {
      return { ...row, card: parseCard(row.text ?? '') }
    } catch {
      return { ...row, card: null }
    }
  })
}

/** Your name, and the way to the browsers signed in as you. Only where there is a door. */
function whoButton() {
  if (!instance.person) return null
  return roundButton('person', `${instance.person.name}: devices and sign out`, () => {
    history.replaceState(null, '', '/devices')
    showDevices()
  })
}

/** Looks like the search field and is a button: tapping it opens search with the keyboard up. */
function searchOpener() {
  const opener = element('button', 'searchbox glass', undefined, [icon('search'), 'Search recipes, ingredients'])
  opener.type = 'button'
  opener.onclick = () => showSearch()
  return opener
}

function addSheet() {
  const sheet = slide(
    element('h2', '', 'Add a recipe'),
    element('div', 'menu', undefined, [
      menuItem('edit', 'Write one', () => {
        sheet.close()
        showWriting()
      }),
      menuItem('paste', 'Paste one', () => {
        sheet.close()
        pasteSheet()
      }),
    ]),
    element('p', 'hint', 'From the web: share the page to lekka with the Add to lekka shortcut.'),
  )
}

function menuItem(name, text, run, className = '') {
  const button = element('button', className, undefined, [icon(name, 20), text])
  button.type = 'button'
  button.onclick = run
  return button
}

/** A recipe in the card's own text, or as the JSON the guide describes: the server reads both. */
function pasteSheet() {
  const area = element('textarea', 'paste')
  area.rows = 10
  area.spellcheck = false
  area.setAttribute('aria-label', 'Recipe')
  area.placeholder = '# Pfannkuchen (12 Stück)\n\n- braten (2 min je Seite)\n  - verrühren\n    - Mehl: 250 g'
  const wrong = element('p', 'hint warning')
  const take = element('button', 'first', 'Add')
  take.type = 'submit'
  const cancel = element('button', 'second', 'Cancel')
  cancel.type = 'button'

  const form = element('form', '', undefined, [
    element('h2', '', 'Paste a recipe'),
    area,
    wrong,
    element('div', 'actions', undefined, [cancel, take]),
  ])
  const sheet = slide(form)
  cancel.onclick = () => sheet.close()
  form.onsubmit = async (event) => {
    event.preventDefault()
    if (take.disabled) return
    take.disabled = true
    try {
      const made = await api.createCard(area.value)
      sheet.close()
      library = null
      showRecipe(made.id)
    } catch (error) {
      wrong.textContent = error instanceof api.ApiError && error.status === 400 ? error.message : reason(error)
      take.disabled = false
    }
  }
  area.focus()
}

/* ---- search ----------------------------------------------------------------- */

async function showSearch() {
  go('/search')
  const input = element('input')
  input.type = 'search'
  input.placeholder = 'Search recipes, ingredients'
  input.setAttribute('aria-label', 'Search recipes, ingredients')
  input.enterKeyHint = 'search'
  input.autocomplete = 'off'

  const clear = element('button', '', undefined, [icon('clear', 22)])
  clear.type = 'button'
  clear.className = 'quiet'
  clear.setAttribute('aria-label', 'Clear search')

  setDock(
    element('div', 'row', undefined, [
      element('label', 'searchbox glass', undefined, [icon('search'), input, clear]),
      roundButton('close', 'Close search', () => {
        history.replaceState(null, '', '/')
        showLibrary()
      }),
    ]),
  )
  // Before anything is awaited, while this is still the tap that opened search: a phone
  // raises its keyboard only for a focus the person caused.
  input.focus()

  const paint = () => {
    clear.hidden = input.value === ''
    show(...renderResults(library ?? [], input.value, { open: showRecipe }))
  }
  input.oninput = paint
  clear.onclick = () => {
    input.value = ''
    input.focus()
    paint()
  }
  paint()

  if (!library) {
    library = await readLibrary().catch(() => [])
    paint()
  }
}

/* ---- a recipe ----------------------------------------------------------------- */

async function showRecipe(id) {
  history.replaceState(null, '', address(id))
  go(address(id))

  let text = library?.find((entry) => entry.id === id)?.text ?? null
  if (text === null) {
    const held = await api.readCard(id).catch(() => null)
    if (held === null) return fail('No recipe under this link.')
    text = held.text
  }

  let card
  try {
    card = parseCard(text)
  } catch (error) {
    if (!(error instanceof ParseError)) throw error
    return fail(`Line ${error.line}: ${error.message}`)
  }

  const draw = (state) => {
    show(
      ...renderRecipe(card, state, {
        back: () => {
          history.replaceState(null, '', '/')
          showLibrary()
        },
        more: () => recipeMenu(id, card),
        redraw: draw,
      }),
    )
  }
  draw({ factor: 1, table: false })
}

function recipeMenu(id, card) {
  const sheet = slide(
    element('h2', '', card.title),
    element('div', 'menu', undefined, [
      menuItem('edit', 'Edit', () => {
        sheet.close()
        showEditor(id, toDraft(card))
      }),
      instance.mode === 'GRANT'
        ? menuItem('share', 'Share', () => {
            sheet.close()
            share(id, card)
          })
        : null,
      menuItem(
        'trash',
        'Delete',
        () => {
          sheet.close()
          erase(id, card)
        },
        'danger',
      ),
    ]),
  )
}

/** Deleting drops the recipe itself, for everyone who could open it. */
async function erase(id, card) {
  if (!confirm(`Delete ${card.title} for everyone who can open it?`)) return
  if ((await attempt(() => api.deleteCard(id), 'The recipe was not deleted.')) === FAILED) return
  library = null
  history.replaceState(null, '', '/')
  showLibrary()
}

/* ---- still drawn as the datasheet ---------------------------------------------- */

/**
 * A screen not drawn again yet: the same parts as before, in a datasheet box under a bar
 * with the way back. `back` is the label of where it leads.
 */
function legacy(title, back, ...parts) {
  show(
    element('div', 'bar', undefined, [
      back ? roundButton('back', back.label, back.run) : null,
      element('span', 'middle', title),
      back ? element('span', 'round') : null,
    ]),
    element('div', 'datasheet', undefined, parts),
  )
}

/**
 * The editor holds the draft, so the screen is built once and repaints itself. Coming
 * back out re-reads the recipe from the server, which is the only copy that counts.
 *
 * A recipe being written for the first time has no id yet. It is made on the first save
 * and not before: a recipe nobody finished writing never reaches the server at all.
 */
function showEditor(id, draft) {
  go(id ? address(id) : '/new')
  const close = () => {
    library = null
    if (id) return showRecipe(id)
    history.replaceState(null, '', '/')
    return showLibrary()
  }
  legacy(
    id ? 'Edit' : 'New recipe',
    null,
    buildEditor({
      draft,
      onClose: close,
      onSave: async (text) => {
        if (id) {
          try {
            await api.writeCard(id, text)
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
        return null
      },
    }),
  )
}

function showWriting() {
  history.replaceState(null, '', '/new')
  showEditor(null, { title: '', yields: null, notes: [], preparations: [], strands: [] })
}

function share(id, card) {
  shareOpen(id, card).catch((error) => notice(`Who holds this did not load. ${reason(error)}`))
}

/**
 * Whether this one is yours is the server's to say, so it is asked before anything opens:
 * a panel that appears and then explains it cannot do anything is worse than no panel.
 */
async function shareOpen(id, card) {
  let held
  try {
    held = await api.grantsOn(id)
  } catch (error) {
    if (error instanceof api.ApiError && error.status === 404)
      return notice('This recipe is not yours to share.')
    throw error
  }
  shareSheet({
    id,
    title: card.title,
    me: instance.person?.id ?? null,
    held,
    onPeople: () => api.people().catch(() => null),
    onList: async () => {
      try {
        return await api.grantsOn(id)
      } catch (error) {
        notice(`Who holds this did not load. ${reason(error)}`)
        return null
      }
    },
    onGive: async (asked) => {
      try {
        return await api.share(id, asked)
      } catch (error) {
        return { error: `Not shared. ${reason(error)}` }
      }
    },
    onRevoke: (grant) => attempt(() => api.revokeGrant(grant), 'It was not revoked.'),
  })
}

/** A join link's token, carried in the fragment so it reaches no log. */
function joinLink() {
  if (location.pathname !== '/join') return null
  return location.hash.length > 1 ? location.hash.slice(1) : null
}

function showSignIn(message = null) {
  go('/')
  const first =
    message === 'first'
      ? band('Nobody has signed in here yet. The link that makes the first person is in the server’s log.', 'warning')
      : null
  legacy(
    'lekka',
    null,
    first ?? (message ? band(message, 'warning') : null),
    section('Sign in'),
    signInForm({ onSignIn: signedIn }),
  )
}

async function signedIn(name, password) {
  try {
    await api.signIn(name, password)
  } catch (error) {
    return showSignIn(
      error instanceof api.ApiError && error.status === 401 ? 'That name and password do not match.' : reason(error),
    )
  }
  instance = await api.me()
  return start()
}

/**
 * A link somebody was sent, whatever kind it is. The server says which, so the screen
 * never has to guess and a spent or expired one says so before anybody fills a form in.
 */
async function showJoining(token) {
  go('/join')
  const invite = await api.invite(token).catch(() => null)
  if (!invite)
    return legacy(
      'lekka',
      null,
      section('Join'),
      band('This link has been used already, or it has expired. Ask for another.', 'warning'),
      signInForm({ onSignIn: signedIn }),
    )

  legacy(
    'lekka',
    null,
    section('Join'),
    joiningForm({
      invite,
      onJoin: async (who) => {
        try {
          await api.redeem(token, who)
        } catch (error) {
          showJoining(token)
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
  go('/devices')
  const list = await attempt(() => api.sessions(), 'The list did not load.')
  if (list === FAILED) return

  const everyone = instance.person?.admin ? await api.people().catch(() => null) : null

  legacy(
    instance.person?.name ?? 'Devices',
    {
      label: 'Back to recipes',
      run: () => {
        history.replaceState(null, '', '/')
        showLibrary()
      },
    },
    section('Devices'),
    renderDevices(list, instance.session, {
      onRevoke: async (id) => {
        if ((await attempt(() => api.revokeSession(id), 'It was not revoked.')) === FAILED) return
        showDevices()
      },
      onInvite: async () => {
        const made = await attempt(() => api.makeInvite(), 'No link was made.')
        return made === FAILED ? null : made
      },
      onSignOut: async () => {
        await api.signOut().catch(() => {})
        instance = { ...instance, person: null, session: null }
        await purge()
        history.replaceState(null, '', '/')
        showSignIn('Signed out.')
      },
    }),
    everyone ? section('People') : null,
    everyone
      ? renderHousehold(everyone, instance.person.id, {
          onRemove: async (person) => {
            if (
              !confirm(`Remove ${person.name}? They are signed out everywhere, and any recipe they own becomes yours.`)
            )
              return
            if ((await attempt(() => api.removePerson(person.id), 'They were not removed.')) === FAILED) return
            showDevices()
          },
        })
      : null,
  )
}

/**
 * What this browser keeps of somebody else's recipes, dropped. The app shell is left in
 * place so lekka still opens without a network; only what was read through the door goes.
 */
async function purge() {
  library = null
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

/** The session ended somewhere else - another browser's Revoke, or a restart. */
async function locked() {
  instance = { ...instance, person: null, session: null }
  await purge()
  showSignIn('You were signed out.')
}

/* ---- the frame ------------------------------------------------------------------ */

const FAILED = Symbol('failed')

/** A write that does not arrive is said out loud, never swallowed. */
async function attempt(work, message) {
  try {
    return await work()
  } catch (error) {
    if (error instanceof api.ApiError && error.status === 401) {
      await locked()
      return FAILED
    }
    screen.prepend(notice(`${message} ${reason(error)}`))
    return FAILED
  }
}

function reason(error) {
  if (error instanceof api.ApiError)
    return error.status === 404 ? 'The link is gone.' : `The server said ${error.status}.`
  if (error instanceof TypeError) return 'No connection.'
  return error.message
}

function notice(message) {
  return element('div', 'notice warning', message)
}

/** The datasheet's own warning, for the screens still drawn with it. */
function band(message, kind = '') {
  return element('div', `band ${kind}`.trim(), message)
}

/** A new screen: nothing floating over it yet, scrolled to its top. */
function go(path, { home = false } = {}) {
  setDock()
  document.body.classList.toggle('home', home)
  window.scrollTo(0, 0)
  if (path !== location.pathname) history.replaceState(null, '', path)
}

function setDock(...rows) {
  dock.replaceChildren(...rows.filter(Boolean))
  document.body.classList.toggle('docked', dock.childElementCount > 0)
}

function fail(message) {
  show(
    element('div', 'bar', undefined, [
      roundButton('back', 'Back to recipes', () => {
        history.replaceState(null, '', '/')
        showLibrary()
      }),
    ]),
    notice(message),
  )
}

function show(...parts) {
  screen.replaceChildren(...parts.filter(Boolean))
}

/**
 * The worker lives here and not in a tag in the page, because the policy the server sends
 * allows no inline script. Registering fails without a secure context, which plain http gives.
 */
function register() {
  navigator.serviceWorker?.register('/sw.js').catch((error) => console.warn('no worker', error))
}

/* Last, once every binding above exists. WebKit checks a `let` when an assignment names
 * it, not when the value arrives after an `await`, so `boot()` called above `let instance`
 * stopped there and drew nothing - on every iPhone, while Chrome drew the page. */
boot()
register()
