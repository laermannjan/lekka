import { splitAside } from './card.js'
import { buildForest } from './grid.js'
import { nameSection, specification } from './page.js'
import { renderGrid } from './render.js'
import { buildForm } from './form.js'
import {
  candidates, inputs, validate, label, storedForm,
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
 * **Nothing is written in the table.** Tapping a row or a step opens the form, which is
 * a layer over the page; the table itself is the table it is read as, to the pixel, and
 * the only thing that ever differs is colour. Cells used to open where they stood, and a
 * field is not the words it replaces - it wraps at a different width - so the one piece
 * of text being looked at reflowed as it was reached for.
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
  let saving = false

  /**
   * The one thing the form is open on, and the form itself.
   *
   * One at a time, and never more: what is written is written about a single row or a
   * single step, and the ring in the table says which.
   */
  let here = null
  let form = null

  /**
   * What the open step takes, as the nodes themselves - whole strands, not the rows
   * inside them. Nodes are the same objects across a repaint, so this survives one.
   *
   * It is what the table shades while the form is open. Nothing moves before `Apply`:
   * a row that leaves a step becomes a strand of its own and is drawn somewhere else.
   */
  let taken = new Set()

  const written = () => ({
    onYields: (text) => amend({ yields: text.trim() === '' ? null : text.trim() }),
    onNotes: (notes) => amend({ notes }),
    onPreparations: (lines) => amend({ preparations: lines.map(asPreparation) }),
  })

  // The table is rebuilt on every repaint. Without this a wide card jumps back to its
  // first column each time, which is exactly while the cook is working across it.
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

  const change = (next) => {
    current = next
    dirty = true
    notice = null
    onChange?.(current)
    paint()
  }

  /** A field of the heading or the specification, committed when the caret leaves it. */
  const amend = (fields) => change({ ...current, ...fields })

  const rename = (title) => amend({ title })

  function say(text) {
    notice = { text, bad: true }
    paint()
  }

  /* ---- the form -------------------------------------------------------- */

  /** What the open step may take: its own inputs, plus whatever is still loose. */
  const offered = () => (here?.kind === 'step' ? candidates(current, here) : [])

  /**
   * Everything a chosen input brings with it, which is what the table shades: the input
   * itself, every step between it and the rows, and the rows. A strand goes in whole, so
   * the whole of it is what is coming.
   */
  function within(node, into = []) {
    into.push(node)
    for (const child of node.children ?? []) within(child, into)
    return into
  }

  const shaded = () => new Set([...taken].flatMap((node) => within(node)))

  /**
   * Open the form on one row or one step.
   *
   * The table is not touched: it keeps its shape, and gains a ring on what is open and a
   * shading on what goes into it. Both are behind the form's own backdrop while it is
   * up, and both are what you come back to when it closes.
   */
  function open(node) {
    if (form) close()
    here = node
    taken = new Set(node.kind === 'step' ? inputs(node) : [])
    paint()

    form = buildForm({
      node,
      place: place(node),
      offers: offered(),
      onChoose: (now) => {
        taken = new Set(now)
        paint()
      },
      onApply: (said) => apply(node, said),
      onDrop: () => drop(node),
      onClose: close,
    })
    document.body.append(form)
    form.showModal?.()
    form.settle?.()
  }

  /** Where a step stands, for the form's heading. A row stands in no column. */
  function place(node) {
    if (node.kind !== 'step') return ''
    const grid = buildForest(current.strands, current.preparations)
    const cell = grid.cells.find((one) => one.node === node)
    return cell ? `column ${String(cell.column).padStart(2, '0')}` : ''
  }

  function close() {
    form?.close?.()
    form?.remove?.()
    form = null
    here = null
    taken = new Set()
    paint()
  }

  /**
   * What the form says, written into the draft. Only here does anything move.
   *
   * A step keeps nothing it was not told: the form showed every field it has and every
   * input it may take, so what comes back is the whole of it.
   */
  function apply(node, said) {
    const next =
      node.kind === 'ingredient'
        ? editIngredient(current, node, said.fields)
        : editStep(current, node, { ...said.fields, inputs: said.inputs })
    close()
    change(next)
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
    const next = removeNode(current, node)
    close()
    change(next)
  }

  /* ---- the screen ------------------------------------------------------- */

  function paint() {
    const faults = validate(current)
    const across = scroller?.scrollLeft ?? 0
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
        report(faults),
        hint(faults),
        specification(current, written()),
      ].filter(Boolean),
    )
    // Only once it is on the page does it have anything to scroll.
    if (scroller) scroller.scrollLeft = across
    remeasure()
  }

  /**
   * `Save` and `Cancel`, under the table, where `Edit` stood a moment ago: the button
   * that leaves writing is in the place the button that entered it was.
   *
   * There is no second row beside them. What can be done to one row or one step is done
   * in the form, where that row or step is.
   */
  function actions(faults) {
    const save = element('button', 'go', 'Save')
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

    return element('div', 'bar after', undefined, [save, leave])
  }

  /**
   * A step, unnamed, with the form open on it and its boxes already ticked.
   *
   * What it takes to begin with is what you almost always mean: every ingredient still
   * waiting for a step, or - if none is waiting - the ends of the strands, which is how
   * two of them are joined. Either way it is a guess you can see and untick.
   */
  function makeStep() {
    const loose = current.strands.filter((strand) => strand.kind === 'ingredient')
    const wanted = loose.length > 0 ? loose : current.strands
    if (wanted.length === 0) return say('Add an ingredient first.')

    const before = new Set(current.strands)
    const next = addStep(current, { verb: '', aside: '', preparations: [], inputs: wanted })
    const made = next.strands.find((strand) => !before.has(strand))
    change(next)
    open(made)
  }

  /**
   * A row, empty, with the form open on it. There is no form to fill in first: the row
   * is made and then named, and a blank one is simply a fault until it is not.
   */
  function addRow() {
    const next = addIngredient(current, {})
    change(next)
    open(next.strands.at(-1))
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
      line.onclick = () => open(target)
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
    const grid = buildForest(current.strands, current.preparations)
    const holder = element('div', 'scroll')
    scroller = holder
    // Asked once for the whole drawing, not once per node: it walks the forest, and a
    // table of a forest has a node for every row and every cell.
    const shade = shaded()
    holder.append(
      renderGrid(grid, 1, {
        onPick: open,
        here: (node) => node === here,
        chosen: (node) => shade.has(node),
        onAdd: addRow,
        onStep: makeStep,
      }),
    )
    return holder
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
