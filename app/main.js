import { parseCard, ParseError } from './card.js'
import { renderReading } from './read.js'
import { renderHeld, renderOverview } from './overview.js'
import * as api from './api.js'
import { toDraft } from './edit.js'
import { buildEditor } from './editor.js'
import { section, specification } from './page.js'
import { cache, cached, collection, forget, known, rows, setRows, useCollection } from './library.js'
import { svg } from './qr.js'
import { address, arrive } from './link.js'

const SCALES = [
  [0.5, '½×'],
  [1, '1×'],
  [1.5, '1½×'],
  [2, '2×'],
]

const stamp = document.getElementById('stamp')
const acts = document.getElementById('acts')
const screen = document.getElementById('screen')
const where = document.getElementById('where')

start()
register()

async function start() {
  const here = arrive()
  if (here.kind === 'card') return showCard(here.id, here.key)
  if (here.kind === 'collection') return showCollection(here.id, here.key)

  // The foot says `/new` while a fresh recipe is being written, so the address has to
  // mean it: without this, opening it lands on the overview under a foot saying `/new`.
  if (here.path === '/new') return showWriting()

  return showOverview()
}

async function showOverview() {
  page('/')
  const held = collection()
  if (!held) return show(section('Recipes'), welcome())

  let list = rows(held.id)
  let note = null
  try {
    list = (await api.readCollection(held.id, held.key)).rows
    setRows(held.id, list)
  } catch {
    note = band('Offline. Showing the recipes this device remembers.')
  }

  show(
    note,
    section('Recipes'),
    renderOverview(await describe(list), {
      onRemove: (id) => remove(held, id),
      onDelete: (id, key, card) => erase(held, id, key, card),
      onImport: () => showImport(held),
      onCreate: () => showWriting(),
    }),
    ...heldCollections(held),
  )
}

/**
 * Said only when there is more than one, because the masthead already stamps the one in
 * use. A single collection is not a choice, and a table offering it is a table asking a
 * question with one answer.
 */
function heldCollections(held) {
  const all = known()
  if (all.length < 2) return []
  return [
    section('Collections'),
    renderHeld(all, held.id, {
      onUse: (entry) => {
        useCollection(entry)
        showOverview()
      },
      onForget: (id) => {
        forget(id)
        showOverview()
      },
    }),
  ]
}

async function showCollection(id, key) {
  page(`/c/${id}`)
  const found = await api.readCollection(id, key).catch(() => null)
  if (!found) return fail('No collection under this link.')
  const list = found.rows

  if (!key)
    return show(
      band('Someone else’s collection. You can read these recipes, not change them.'),
      section('Recipes'),
      renderOverview(await describe(list)),
    )

  useCollection({ id, key })
  setRows(id, list)
  history.replaceState(null, '', '/')
  return showOverview()
}

async function showCard(id, key, state = {}) {
  const { scale = 1, at = 0, fit = false } = state
  const here = { scale, at, fit }

  const text = await load(id)
  if (text === null) return fail('No recipe under this link.')

  let card
  try {
    card = parseCard(text)
  } catch (error) {
    if (!(error instanceof ParseError)) throw error
    return fail(`Line ${error.line}: ${error.message}`)
  }

  const fitting = fitter(id, key, here)

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
  page(`/r/${id}`, scales(id, key, here), fitting.button)
  show(
    section(card.title, card.yields),
    body(card, id, key, here, fitting.tell),
    // What changes the recipe itself sits past it, out of the way of reading.
    after(composer(id, key, card), keeper(id, key, here)),
    specification(card),
  )
}

function body(card, id, key, state, onFits) {
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
function fitter(id, key, state) {
  const button = element('button', 'quiet', state.fit ? 'Actual size' : 'Fit to screen')
  button.onclick = () => showCard(id, key, { ...state, fit: !state.fit })
  button.hidden = true
  return {
    button,
    // A recipe drawn whole needs no fitting; one already fitted needs the way back.
    tell: (whole) => {
      button.hidden = whole && !state.fit
    },
  }
}

function composer(id, key, card) {
  if (!key) return null
  const button = element('button', 'quiet', 'Edit')
  button.onclick = () => showEditor(id, key, toDraft(card))
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
function showEditor(id, key, draft) {
  const held = collection()

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
      onClose: () => (id ? showCard(id, key) : showOverview()),
      onSave: async (text) => {
        if (id) {
          try {
            await api.writeCard(id, key, text)
          } catch (error) {
            return `Not saved. ${reason(error)}`
          }
          keep(id, text)
          return null
        }

        let made
        try {
          made = await api.createCard(text)
        } catch (error) {
          return `Not saved. ${reason(error)}`
        }
        id = made.id
        key = made.key
        keep(id, text)
        history.replaceState(null, '', address('/r/', id, key))
        page(`/r/${id}`)

        // The recipe is saved either way. A collection that would not take it is said
        // out loud rather than reported as a failed save.
        if (held) {
          const kept = await attempt(
            () => change(held, (current) => [...current, made]),
            'It was saved, but not put in your collection.',
          )
          if (kept === FAILED) notice(`Its link is /r/${id}/${key}`)
        }
        return null
      },
    }),
  )
}

/** Caching is a convenience; storage that refuses is not worth failing a write over. */
function keep(id, text) {
  try {
    cache(id, text)
  } catch (error) {
    console.warn('not cached', error)
  }
}

async function load(id) {
  try {
    const text = await api.readCard(id)
    cache(id, text)
    return text
  } catch {
    return cached(id)
  }
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

function keeper(id, key, state) {
  const held = collection()
  if (!held) {
    const create = element('button', 'quiet', 'Save to collection')
    create.onclick = async () => {
      const made = await attempt(
        () => api.createCollection([{ id, ...(key ? { key } : {}) }]),
        'The collection was not made.',
      )
      if (made === FAILED) return
      useCollection(made)
      location.assign('/')
    }
    return create
  }

  const list = rows(held.id)
  const found = list.find((row) => row.id === id)
  /*
   * Nothing at all when the recipe is already kept. A status has no business in a row of
   * actions - it read as the heading of the buttons beside it - and the absence of a
   * save is the answer to the question it was asking: there is nothing left to do.
   */
  if (found && (found.key || !key)) return null

  const save = element('button', 'quiet', found ? 'Keep the edit link' : 'Save to collection')
  save.onclick = async () => {
    const done = await attempt(
      () =>
        change(held, (current) => [
          ...current.filter((row) => row.id !== id),
          { id, ...(key ? { key } : {}) },
        ]),
      'The collection was not changed.',
    )
    if (done === FAILED) return
    showCard(id, key, state)
  }
  return save
}

async function remove(held, id) {
  const done = await attempt(
    () => change(held, (current) => current.filter((row) => row.id !== id)),
    'The recipe was not removed.',
  )
  if (done === FAILED) return
  showOverview()
}

/** Removing drops the link. Deleting drops the recipe, for everyone holding one. */
async function erase(held, id, key, card) {
  const name = card ? card.title : id
  if (!confirm(`Delete ${name} for everyone who has its link?`)) return
  if ((await attempt(() => api.deleteCard(id, key), 'The recipe was not deleted.')) === FAILED)
    return
  await remove(held, id)
}

/** Read, change, write, and start again if another device wrote in between. */
async function change(held, edit) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { rows: current, version } = await api.readCollection(held.id, held.key)
    const next = edit(current)
    try {
      await api.writeCollection(held.id, held.key, next, version)
      setRows(held.id, next)
      return next
    } catch (error) {
      if (error.status !== 412) throw error
    }
  }
  throw new Error('the collection kept changing')
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
function showImport(held) {
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
    keep(made.id, area.value)

    const kept = await attempt(
      () => change(held, (current) => [...current, made]),
      'It was imported, but not put in your collection.',
    )
    box.close()
    if (kept === FAILED) return notice(`Its link is /r/${made.id}/${made.key}`)
    showOverview()
  }

  form.append(heading, field, wrong, element('div', 'actions', undefined, [take, cancel]))
  box.append(form)
  box.onclose = () => box.remove()
  document.body.append(box)
  box.showModal()
  area.focus()
}

function welcome() {
  const box = element('div', 'list')
  const line = element('div', 'row')
  const create = element('button', 'go', 'Create a collection')
  create.onclick = async () => {
    const made = await attempt(() => api.createCollection([]), 'The collection was not made.')
    if (made === FAILED) return
    useCollection(made)
    showOverview()
  }
  line.append(create, element('span', 'aside', 'or open the link to one you already have'))
  box.append(line)
  return box
}

/**
 * The collection, stamped into the masthead.
 *
 * A person holds one collection, so it belongs to the app rather than to any screen and
 * is said once. It is a value, so it is tinted like a tag; it is also the only way to
 * the code that carries the collection onto another device, so it is drawn like a
 * control and says what it will do the moment it is pointed at.
 */
function showStamp() {
  const held = collection()
  if (!held) return void stamp.replaceChildren()

  const button = element('button', 'stamp')
  button.type = 'button'
  button.append(mark(), element('span', 'value', held.id), element('span', 'hint', 'Show QR code →'))
  button.onclick = () => showShare(held)
  stamp.replaceChildren(button)
}

/** A code, drawn small enough to say "code" and no more. */
function mark() {
  const box = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  box.setAttribute('class', 'mark')
  box.setAttribute('viewBox', '0 0 9 9')
  box.setAttribute('fill', 'currentColor')
  box.setAttribute('aria-hidden', 'true')
  box.innerHTML =
    '<path d="M0 0h3v3H0zM6 0h3v3H6zM0 6h3v3H0z"/>' +
    '<path d="M4 0h1v1H4zM4 2h1v1H4zM0 4h1v1H0zM2 4h1v1H2zM4 4h1v1H4zM6 4h1v1H6zM8 4h1v1H8z' +
    'M4 6h1v1H4zM6 6h1v1H6zM8 6h1v1H8zM4 8h1v1H4zM6 8h1v1H6zM8 8h1v1H8z"/>'
  return box
}

function showShare(held) {
  const link = new URL(address('/c/', held.id, held.key), location.origin).href
  const box = element('dialog', 'sheet')

  const code = element('div', 'code')
  try {
    code.innerHTML = svg(link)
  } catch {
    code.replaceChildren(element('p', 'note', 'The link is too long for a code.'))
  }

  // Written out in full and wrapped, because a link one cannot read is a link one cannot type.
  const field = element('p', 'address', link)
  const select = () => {
    const range = document.createRange()
    range.selectNodeContents(field)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  }
  // A click selects the whole address, unless one has just dragged out a part of it.
  field.onclick = () => {
    if (getSelection().isCollapsed) select()
  }

  const copy = element('button', 'quiet', 'Copy link')
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(link)
      copy.textContent = 'Copied'
    } catch {
      select()
      copy.textContent = 'Copy it by hand'
    }
  }

  const close = element('button', 'quiet', 'Close')
  close.onclick = () => box.close()

  const title = element('p', 'verb', 'Open this collection on another device')
  title.id = 'share-title'
  box.setAttribute('aria-labelledby', title.id)

  box.append(
    title,
    code,
    element('p', 'note', 'Scan the code, or open the link. Whoever has it can change these recipes.'),
    field,
    element('div', 'bar', undefined, [copy, close]),
  )
  box.onclose = () => box.remove()
  document.body.append(box)
  box.showModal()
  copy.focus()
}

const FAILED = Symbol('failed')

/** A write that does not arrive is said out loud, never swallowed. */
async function attempt(work, message) {
  try {
    return await work()
  } catch (error) {
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
  showStamp()
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

function scales(id, key, state) {
  const group = element('span', 'switch')
  for (const [factor, text] of SCALES) {
    const button = element('button', '', text)
    button.setAttribute('aria-pressed', factor === state.scale)
    button.onclick = () => showCard(id, key, { ...state, scale: factor })
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
