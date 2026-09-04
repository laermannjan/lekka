import { splitAside } from './card.js'
import { buildForest } from './grid.js'
import { nameSection, specification } from './page.js'
import { fit, renderGrid } from './render.js'
import {
  candidates, fieldsOf, validate, label, storedForm, beneath,
  addIngredient, addStep, editIngredient, editStep, removeNode, claim, upheaval, sweptBy,
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
   * The rows ticked, as ingredient nodes. Nodes are the same objects across a repaint,
   * so a selection survives one; a row that stops existing simply stops being drawn.
   */
  let chosen = new Set()
  let anchor = null
  /** The step whose inputs are being chosen, if the cook is choosing them. */
  let editing = null

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

  const change = (next) => {
    current = next
    dirty = true
    notice = null
    chosen = new Set()
    anchor = null
    editing = null
    openAt = null
    want = null
    onChange?.(current)
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
    // The cell has said what it holds, so it goes back to being read.
    openAt = null
    want = null
    // A step keeps whatever it holds: only what the cell showed is being written.
    const was = node.kind === 'step' ? fieldsOf(node) : null
    current =
      node.kind === 'ingredient'
        ? editIngredient(current, node, fields)
        : editStep(current, node, { ...was, ...fields })
    dirty = true
    notice = null
    onChange?.(current)

    paint()
  }

  /** The report and Save brought up to date without the table being drawn again. */
  function resettle() {
    const faults = validate(current)
    if (saveButton) saveButton.disabled = faults.length > 0 || !dirty || saving

    const next = report(faults)
    if (reported && next) reported.replaceWith(next)
    else if (reported) reported.remove()
    else if (next) box.insertBefore(next, box.children[1] ?? null)
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

  /**
   * Which rows go into a step, asked in the table rather than in a list.
   *
   * Shift or a long press on a step ticks the rows it holds; from there they are ticked
   * and unticked like any others, and `Apply` reads back what they now come to. The list
   * of candidates the form used to show was the same question asked about names.
   */
  function pickStep(node) {
    editing = node
    chosen = new Set(beneath(node))
    anchor = null
    notice = null
    // The cell closes: what is being chosen is rows, and they have to be readable.
    openAt = null
    want = null
    paint()
  }

  /**
   * What the ticked rows come to, for the step being edited.
   *
   * Not `claim`, which answers "what holds these rows" and climbs the whole tree: from
   * inside a step, every row of it is also every row of the step above, so claim would
   * answer with the step this one sits in. The question here is narrower - which of the
   * things this step *may* take are wholly ticked - so it is asked of the candidates,
   * which are its own inputs plus whatever is still loose outside it.
   */
  function intake() {
    return candidates(current, editing).filter((node) =>
      beneath(node).every((row) => chosen.has(row)),
    )
  }

  function apply() {
    const wanted = intake()
    const covered = new Set(wanted.flatMap(beneath))
    const stray = [...chosen].filter((row) => !covered.has(row))

    if (wanted.length === 0)
      return say('A step has to take something. Tick the rows that go into it.')
    if (stray.length > 0)
      return say(
        `${stray.map(label).join(', ')} cannot go into ${label(editing)}: ` +
          'it is already inside a step this one is part of.',
      )

    const step = editing
    editing = null
    change(editStep(current, step, { ...fieldsOf(step), inputs: wanted }))
  }

  function say(text) {
    notice = { text, bad: true }
    paint()
  }

  /** Ticking a row, or a run of them from the last row touched. */
  function choose(nodes, on, extend) {
    const order = rowOrder()
    if (extend && anchor && nodes.length === 1) {
      const from = order.indexOf(anchor)
      const to = order.indexOf(nodes[0])
      if (from !== -1 && to !== -1)
        nodes = order.slice(Math.min(from, to), Math.max(from, to) + 1)
    }
    for (const node of nodes) if (on) chosen.add(node)
      else chosen.delete(node)
    if (nodes.length === 1) anchor = nodes[0]
    paint()
  }

  /** Every row on the screen, top to bottom, which is what a shift-click runs along. */
  function rowOrder() {
    return current.strands.flatMap(beneath)
  }

  /** Open a cell, with the caret in the field that was tapped. */
  function reveal(node, field) {
    openAt = node
    want = field
    paint()
  }

  function shut() {
    if (!openAt) return
    openAt = null
    want = null
    paint()
  }

  function paint() {
    const faults = validate(current)
    const across = scroller?.scrollLeft ?? 0
    reported = report(faults)
    box.replaceChildren(
      ...[
        nameSection(current.title, rename),
        reported,
        selection(),
        table(),
        actions(faults),
        hint(faults),
        (specified = specification(current, written())),
      ].filter(Boolean),
    )
    // Only once it is on the page does it have anything to scroll.
    if (scroller) scroller.scrollLeft = across
    remeasure()

    const fields = opened.get(openAt)
    if (!fields) return
    for (const field of fields.all ?? Object.values(fields)) fit(field)
    const caret = fields[want] ?? fields.verb ?? fields.amount
    caret?.focus?.()
    caret?.select?.()
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

    /*
     * What goes into a step is not something the step says about itself, so it is not a
     * field in its cell: it is rows, ticked in the table. Shift and a long press have
     * always said so, and neither is visible - a step you have opened has to be able to
     * tell you that its inputs can be changed at all.
     */
    const inputs =
      openAt?.kind === 'step'
        ? button(`Choose what goes into ${label(openAt)}`, () => pickStep(openAt))
        : null

    return element('div', 'bar after', undefined, [save, leave, inputs].filter(Boolean))
  }

  /**
   * What the ticked rows would become. It appears only when something is ticked, so the
   * table is quiet until the cook has said what they mean, and it names both halves of
   * the move: what goes in, and what that would take it out of.
   */
  function selection() {
    if (chosen.size === 0 && !editing) return null
    const taken = editing ? intake() : claim(current, chosen)
    const { moved, emptied } = editing ? { moved: [], emptied: [] } : upheaval(current, taken)

    const rows = [...chosen]
    const bar = element('div', 'bar chosen')
    bar.append(
      element('span', 'label', editing ? `Goes into ${label(editing)}` : `${chosen.size} chosen`),
      element('span', 'takes', taken.map(label).join(' + ') || 'nothing'),
    )

    if (editing) {
      const go = element('button', 'go', 'Apply')
      go.onclick = apply
      const erase = element('button', 'quiet danger', 'Delete step')
      erase.onclick = () => drop([editing])
      bar.append(go, erase, button('Cancel', clear))
      return bar
    }

    const go = element('button', 'go', 'Process in step')
    go.onclick = () => makeStep(taken)

    /*
     * Deleting takes the rows themselves and not what holds them. `Process in step` asks
     * what these rows currently belong to, because that is what a new step would take;
     * this asks nothing - a ticked row is the ingredient on it, and the one row of a
     * one-row recipe is that ingredient and not the step standing over it.
     */
    const erase = element('button', 'quiet danger', rows.length > 1 ? 'Delete all' : 'Delete')
    erase.onclick = () => drop(rows)

    bar.append(go, erase, button('Clear', clear))

    if (moved.length === 0) return bar
    return element('div', '', undefined, [
      bar,
      element(
        'div',
        'band warning',
        [
          ...moved.map(({ node, from }) => `${label(node)} comes out of ${label(from)}.`),
          ...emptied.map((step) => `${label(step)} would be left empty, so it goes too.`),
        ].join(' '),
      ),
    ])
  }

  function clear() {
    chosen = new Set()
    anchor = null
    editing = null
    paint()
  }

  /**
   * A step made from the ticked rows, unnamed, with the caret in it. The verb used to be
   * asked for in a form before the step existed; here the step is made and then named,
   * which is what `+ Ingredient` does with a row.
   */
  function makeStep(taken) {
    if (taken.length === 0) return say('Tick the rows that go into the step first.')
    const before = new Set(current.strands)
    const next = addStep(current, { verb: '', aside: '', preparations: [], inputs: taken })
    const made = next.strands.find((strand) => !before.has(strand))
    change(next)
    reveal(made, 'verb')
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
    const grid = buildForest(current.strands, current.preparations)
    const box = element('div', 'scroll')
    scroller = box
    box.append(
      renderGrid(grid, 1, {
        openAt,
        onOpen: reveal,
        onField: write,
        onEditStep: pickStep,
        onDrawn: (node, input) => opened.set(node, input),
        onChoose: choose,
        chosen: (node) => chosen.has(node),
        onAdd: addRow,
        onStep: () => makeStep(claim(current, chosen)),
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
    change(next)
    reveal(next.strands.at(-1), 'amount')
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
  function drop(nodes) {
    const taken = [].concat(nodes)
    const swept = taken.flatMap((node) => sweptBy(current, node)).filter((node) => !taken.includes(node))
    if (swept.length > 0) {
      const names = [...new Set(swept.map(label))].join(', ')
      const going = swept.length === 1 ? 'it goes' : 'they go'
      if (!confirm(`Deleting ${taken.map(label).join(', ')} leaves ${names} with nothing, so ${going} too. Delete anyway?`))
        return
    }
    let next = current
    for (const node of taken) next = removeNode(next, node)
    change(next)
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
