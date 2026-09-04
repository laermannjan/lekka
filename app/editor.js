import { splitAside } from './card.js'
import { buildForest } from './grid.js'
import { nameSection, specification } from './page.js'
import { fit, renderGrid } from './render.js'
import {
  candidates, fieldsOf, inputs, validate, label, storedForm,
  addIngredient, addStep, editIngredient, editStep, removeNode, sweptBy,
} from './edit.js'

/**
 * Writing a recipe: its name, a table you can tap, and a list of what is still wrong.
 *
 * The screen is the draft made visible. A finished card is one tree, so it draws as one
 * table; half-written it is several strands, so it draws as several, and joining them is
 * plainly the thing left to do. Nothing here decides what may be joined to what - that
 * is `edit.js`, where it can be tested - and nothing here parses. The editor only ever
 * asks the model a question and draws the answer.
 *
 * It owns its own redraw. Everything else in the app rebuilds the screen from the link,
 * which would mean re-reading the recipe from the server and losing the draft, so the
 * editor is one element that repaints itself and hands back a recipe only when saved.
 *
 * It draws the whole screen and not only the table, because everything a person wrote is
 * opened at once: the name above the table, and what it yields, its notes and what has
 * to be done before it in the specification below. There is no separate form for the
 * recipe itself, and so no second place where its name can be changed.
 */
export function buildEditor({ draft, onSave, onClose, onChange }) {
  let current = draft
  let dirty = false
  let notice = null

  /**
   * What is ticked to go into the step being written, as the nodes themselves - a whole
   * strand, not the rows inside it. Nodes are the same objects across a repaint, so a
   * choice survives one.
   *
   * Nothing is applied while it is being made. A row that leaves a step becomes a strand
   * of its own and is drawn somewhere else, and having the table rearrange itself under
   * every tick is no way to decide anything: `Apply` is when it happens.
   */
  let chosen = new Set()

  /**
   * The one cell that is open, and which of its fields the caret goes to.
   *
   * One at a time: a field is a single line and cuts where a cell wraps, so a table of
   * nothing but fields is a table that cannot be read while it is being written in. The
   * rest of the recipe stays exactly as it is read.
   */
  let openAt = null
  let want = null
  let saving = false

  /** The report and the Save button now on the page, so a text edit can refresh them. */
  let reported = null
  let saveButton = null

  /** The fields of the open cell, so a fault or a tap can put the caret in one. */
  let opened = new Map()

  /** The tick boxes now drawn, so the caret can be put back on one after a repaint. */
  let ticked = new Map()

  /**
   * Where the next repaint puts the caret: a field of the open cell, or the box that was
   * just ticked. Null means nobody asked, and the caret is left where the cook put it.
   */
  let caret = null

  /** The specification now on the page. Weight and Time are sums of what the rows say,
      so typing into a row has to be able to bring them up to date. */
  let specified = null

  const written = () => ({
    onYields: (text) => amend({ yields: text.trim() === '' ? null : text.trim() }),
    onNotes: (notes) => amend({ notes }),
    onPreparations: (lines) => amend({ preparations: lines.map(asPreparation) }),
  })

  // The table is rebuilt on every repaint, and a repaint happens on every tick. Without
  // this a wide card jumps back to its first column each time a row is chosen, which is
  // exactly while the cook is working across it.
  let scroller = null

  const box = element('div', 'editor')

  /*
   * What a band spanning the whole table is centred in. The reading view measures this
   * as it settles; here nothing settles, so it is measured after each repaint and again
   * when the window changes.
   *
   * After the repaint, not during it: the first one happens while the editor is still
   * being built and has not been put on the page, so there is nothing to measure yet -
   * and the resize listener is only taken out once it has been, or the first paint would
   * cancel the watch before it began.
   */
  let watching = false
  const measure = () => {
    const grid = scroller?.firstElementChild
    if (!box.isConnected || !grid || typeof scroller.clientWidth !== 'number') return
    grid.style.setProperty('--room', `${scroller.clientWidth}px`)
    if (watching) return
    watching = true
    globalThis.window?.addEventListener('resize', onResize)
  }

  /* A card is drawn afresh on every save and every step back, and the old editor is
     thrown away without being told. Being out of the document is what that looks like. */
  const onResize = () => {
    if (!box.isConnected) return globalThis.window?.removeEventListener('resize', onResize)
    measure()
  }

  const remeasure = () => (globalThis.requestAnimationFrame ?? ((run) => run()))(measure)

  /*
   * A change to the draft, drawn once. `open` is what the change leaves open - the row
   * or step it just made - and it runs before the drawing rather than after it, so a
   * move that both changes the recipe and opens a cell still draws the screen one time.
   */
  const change = (next, open) => {
    current = next
    dirty = true
    notice = null
    chosen = new Set()
    openAt = null
    want = null
    caret = null
    onChange?.(current)
    open?.()
    paint()
  }

  /** A field of the heading or the specification, committed when the caret leaves it. */
  const amend = (fields) => change({ ...current, ...fields })

  /*
   * A field inside the table. Unlike everything else that changes the draft this does
   * not repaint: the row already shows what was typed, nothing else on the screen is
   * drawn from it, and rebuilding the table would take the caret out of the row while
   * the cook is still tabbing along it. Only what does depend on it is refreshed - the
   * faults, and whether Save is allowed.
   */
  function write(node, fields) {
    // A step keeps whatever it holds: only what the cell showed is being written.
    const was = node.kind === 'step' ? fieldsOf(node) : null
    // `editIngredient` and `editStep` write into the node itself, so the cell that is
    // open is still the cell that is open and the fields drawn for it are still its own.
    current =
      node.kind === 'ingredient'
        ? editIngredient(current, node, fields)
        : editStep(current, node, { ...was, ...fields })
    dirty = true
    notice = null
    onChange?.(current)

    resettle()
  }

  /** The report and Save brought up to date without the table being drawn again. */
  function resettle() {
    const faults = validate(current)
    if (saveButton) saveButton.disabled = faults.length > 0 || !dirty || saving

    const next = report(faults)
    if (reported && next) reported.replaceWith(next)
    else if (reported) reported.remove()
    else if (next) box.insertBefore(next, specified ?? null)
    reported = next

    // Safe to rebuild: `resettle` only runs for a field in the table, so the caret is
    // never in the specification when its fields are replaced.
    const facts = specification(current, written())
    if (specified && facts) specified.replaceWith(facts)
    else if (specified) specified.remove()
    else if (facts) box.append(facts)
    specified = facts
  }

  const rename = (title) => amend({ title })

  /** What the open step may take: its own inputs, plus whatever is still loose. */
  const offered = () => (openAt?.kind === 'step' ? candidates(current, openAt) : [])

  /**
   * Everything a ticked input brings with it, which is what the table shades: the input
   * itself, every step between it and the rows, and the rows. A strand goes in whole, so
   * the whole of it is what is coming.
   */
  function within(node, into = []) {
    into.push(node)
    for (const child of node.children ?? []) within(child, into)
    return into
  }

  const shaded = () => new Set([...chosen].flatMap((node) => within(node)))

  function say(text) {
    notice = { text, bad: true }
    paint()
  }

  /** Ticking one of the things the open step may take. */
  function choose(node, on) {
    if (on) chosen.add(node)
    else chosen.delete(node)
    // The repaint throws away the box that was just clicked, so the caret is told to go
    // back to the one drawn in its place. Without this it lands on the verb, and the
    // next box cannot be reached with the keyboard at all.
    caret = { tick: node }
    paint()
  }

  /**
   * What the boxes now say, written into the step. Only here does anything move.
   *
   * The cell stays open: applying is a step in writing the step, not the end of it, and
   * a cook who has just said what goes in usually still has to say what is done with it.
   */
  function apply() {
    const step = openAt
    if (chosen.size === 0) return say('A step has to take something. Tick what goes into it.')

    current = editStep(current, step, { ...fieldsOf(step), inputs: [...chosen] })
    dirty = true
    notice = null
    openAt = step
    chosen = new Set(inputs(step))
    // Back to the verb, because saying what goes in is usually followed by saying what
    // is done with it - but not selected: the verb is already written and the next key
    // would replace it.
    caret = { node: step, field: want ?? 'verb' }
    onChange?.(current)
    paint()
  }

  /**
   * Open a cell, with the caret in the field that was tapped. Opening a step also puts
   * boxes on what it may take, ticked where it already takes it.
   */
  function openTo(node, field) {
    openAt = node
    want = field
    chosen = node.kind === 'step' ? new Set(inputs(node)) : new Set()
    // Selected, because tapping a cell to write in it means writing it again.
    caret = { node, field, select: true }
  }

  function reveal(node, field) {
    openTo(node, field)
    paint()
  }

  function paint() {
    const faults = validate(current)
    const across = scroller?.scrollLeft ?? 0
    reported = report(faults)
    /*
     * Everything that comes and goes is drawn below the row of buttons. A warning that
     * appears above the table pushes the table down under the hand that is working in
     * it; below it, the table stays where it was put.
     */
    box.replaceChildren(
      ...[
        nameSection(current.title, rename),
        table(),
        actions(faults),
        selection(),
        reported,
        hint(faults),
        (specified = specification(current, written())),
      ].filter(Boolean),
    )
    // Only once it is on the page does it have anything to scroll.
    if (scroller) scroller.scrollLeft = across
    remeasure()

    const fields = opened.get(openAt)
    if (fields) for (const field of fields.all ?? Object.values(fields)) fit(field)

    /*
     * The caret is moved only by the move that asked for it. A repaint happens on every
     * tick and every notice, and one that grabs the field each time takes the focus off
     * whatever the cook is using and selects a word they were not editing.
     */
    const going = caret
    caret = null
    if (!going) return
    if (going.tick) return void ticked.get(going.tick)?.focus?.()
    if (!fields) return
    const into = fields[going.field] ?? fields.verb ?? fields.amount
    into?.focus?.()
    if (going.select) into?.select?.()
  }

  /**
   * `Save` and `Cancel`, under the table, where `Edit` stood a moment ago: the button
   * that leaves writing is in the place the button that entered it was.
   *
   * There was a bar above the table with `Write` on it. The label named a mode that
   * every outlined cell on the screen was already announcing, and it sat between the
   * cook and the thing they came to change.
   */
  function actions(faults) {
    const save = element('button', 'go', 'Save')
    saveButton = save
    save.disabled = faults.length > 0 || !dirty || saving
    save.onclick = async () => {
      if (saving) return
      saving = true
      // The draft this write is of. The page stays live while it is in flight, so what
      // comes back can be an answer about a recipe that has since been edited.
      const sent = current
      paint()

      // `finally`, because a throw would otherwise leave `saving` up for good: Save
      // disabled for the life of the editor, no message, and the changes still dirty.
      let failed
      try {
        failed = await commit(sent)
      } catch (error) {
        failed = `Not saved. ${error.message}`
      } finally {
        saving = false
      }
      // A write that arrives is said as plainly as one that does not: without a word
      // either way there is no telling a saved recipe from one the server refused.
      notice = failed
        ? { text: failed, bad: true }
        : current === sent
          ? { text: 'Saved.', bad: false }
          : { text: 'Saved. What you changed while it was sending is not - save again.', bad: false }
      paint()
    }

    // `Cancel` undoes; with nothing to undo it is `Done`, which is what leaving a
    // recipe you only looked at actually is.
    const leave = button(dirty ? 'Cancel' : 'Done', () => {
      if (dirty && !confirm('Leave without saving? The changes are lost.')) return
      onClose()
    })

    // Save and Cancel are about the whole recipe. What can be done to the one cell that
    // is open is drawn apart from them, below.
    return element('div', 'bar after', undefined, [save, leave])
  }

  /**
   * What can be done to the thing that is open. `Save` and `Cancel` are about the whole
   * recipe and stay in their own row above; this is about the one cell, so it is drawn
   * apart from them and only while one is open.
   */
  function selection() {
    if (!openAt) return null
    const acts = []

    if (openAt.kind === 'step') {
      const go = element('button', 'go', 'Apply')
      go.onclick = apply
      acts.push(go)
    }

    const erase = element('button', 'quiet danger', `Delete ${label(openAt)}`)
    erase.onclick = () => drop(openAt)
    acts.push(erase)

    /*
     * Nothing here warns about what applying would disturb, because it cannot disturb
     * anything: a box is offered only for a root or for something this step already
     * takes, and neither is held by another step. `upheaval` still guards the model - it
     * is `edit.js` that would have to answer for a move made any other way.
     */
    return element('div', 'bar chosen', undefined, acts)
  }

  /**
   * A step, unnamed, with the caret in it and its boxes already ticked.
   *
   * What it takes to begin with is what you almost always mean: every ingredient still
   * waiting for a step, or - if none is waiting - the ends of the strands, which is how
   * two of them are joined. Either way it is a guess you can see and untick.
   */
  function makeStep() {
    const loose = current.strands.filter((strand) => strand.kind === 'ingredient')
    const taken = loose.length > 0 ? loose : current.strands
    if (taken.length === 0) return say('Add an ingredient first.')

    const before = new Set(current.strands)
    const next = addStep(current, { verb: '', aside: '', preparations: [], inputs: taken })
    const made = next.strands.find((strand) => !before.has(strand))
    // Opened as part of adding it, not after: `change` draws the screen and `reveal`
    // would draw it a second time, throwing the first away under the hand.
    change(next, () => openTo(made, 'verb'))
  }

  /**
   * The card is only ever stored as text, so saving writes it and reads it back before
   * handing it over. Validation already refuses the punctuation that would not survive;
   * this is the backstop for whatever nobody thought of, and it fails shut.
   */
  async function commit(sent) {
    const text = storedForm(sent)
    if (text === null) return 'This card does not come back the same when stored. Nothing was saved.'
    const failed = await onSave(text)
    if (failed) return failed
    // Only what was sent is saved. An edit made while it was in flight is not, so the
    // flag stays up rather than being cleared for a card the server never saw.
    if (current === sent) dirty = false
    return null
  }

  /** What is wrong, each line leading to the thing it is about. */
  function report(faults) {
    if (notice) return element('div', notice.bad ? 'band warning' : 'band', notice.text)
    if (faults.length === 0) return null

    // "The card has no steps" on a card just made is a scolding, not a fault: the hint
    // under it already says what to do next, and Save is off either way.
    const said = faults.filter((fault) => fault.kind !== 'empty')
    if (said.length === 0) return null

    const list = element('div', 'band warning faults')
    for (const fault of said) {
      const target = fault.node ?? fault.nodes?.[0]
      if (!target) {
        list.append(element('p', '', fault.message))
        continue
      }
      const line = element('button', 'fault', fault.message)
      line.onclick = () => reach(target)
      list.append(line)
    }
    return list
  }

  /**
   * The card, as one table. Not one per strand: they share the ingredient column, and a
   * strand that has not been joined yet is not a different kind of thing needing a
   * drawing of its own - it is some cells further left, with free area after them. An
   * ingredient nobody has used is a row with nothing at all to its right, which is
   * exactly what it is.
   */
  function table() {
    opened = new Map()
    ticked = new Map()
    const grid = buildForest(current.strands, current.preparations)
    const box = element('div', 'scroll')
    scroller = box
    // Asked once for the whole drawing. Both walk the forest, and asked per node they
    // walk it again for every row and every cell of a table that is already a forest.
    const offers = new Set(offered())
    const shade = shaded()
    box.append(
      renderGrid(grid, 1, {
        openAt,
        onOpen: reveal,
        onField: write,
        onDrawn: (node, input) => opened.set(node, input),
        onTicked: (node, input) => ticked.set(node, input),
        onChoose: choose,
        // A box stands for an input; the shading stands for every row under one.
        boxFor: (node) => offers.has(node),
        ticked: (node) => chosen.has(node),
        chosen: (node) => shade.has(node),
        onAdd: addRow,
        onStep: makeStep,
      }),
    )
    return box
  }

  function hint(faults) {
    if (current.strands.length > 0) return null
    return element(
      'div',
      'band',
      faults.some((fault) => fault.kind === 'title')
        ? 'Give the recipe a name, then add the first ingredient.'
        : 'Add an ingredient, then a step that takes it.',
    )
  }

  /**
   * A row, empty, with the caret in it. There is no form to fill in first: the row is
   * the form, and one that is still blank is simply a fault until it is not.
   */
  function addRow() {
    const next = addIngredient(current, {})
    change(next, () => openTo(next.strands.at(-1), 'amount'))
  }

  /**
   * What a fault leads to. Every part of a recipe is a field in the table or in the
   * specification now, so it is always somewhere the caret can be put - which is what
   * "the fault leads to the thing it is about" means once nothing opens a form.
   */
  function reach(node) {
    reveal(node, node.kind === 'ingredient' ? 'name' : 'verb')
  }

  /**
   * Deleting climbs: a step left holding nothing goes too, and so can the step above it,
   * taking its verb, its note and its preparations. Adding a step already says what it
   * would disturb before it does it; deleting has to as well, because there is no undo.
   */
  function drop(node) {
    const swept = sweptBy(current, node).filter((one) => one !== node)
    if (swept.length > 0) {
      const names = [...new Set(swept.map(label))].join(', ')
      const going = swept.length === 1 ? 'it goes' : 'they go'
      if (!confirm(`Deleting ${label(node)} leaves ${names} with nothing, so ${going} too. Delete anyway?`))
        return
    }
    change(removeNode(current, node))
  }

  paint()
  return box
}

function asPreparation(line) {
  return { kind: 'preparation', ...splitAside(line) }
}

function button(text, run) {
  const node = element('button', 'quiet', text)
  node.onclick = run
  return node
}

function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children)
  return node
}
