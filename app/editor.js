import { splitAside } from './card.js'
import { buildForest } from './grid.js'
import { nameSection, specification } from './page.js'
import { renderGrid } from './render.js'
import { ingredientSheet, stepSheet } from './sheet.js'
import {
  candidates, parentOf, fieldsOf, validate, label, storedForm, beneath,
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
  let saving = false

  // The table is rebuilt on every repaint, and a repaint happens on every tick. Without
  // this a wide card jumps back to its first column each time a row is chosen, which is
  // exactly while the cook is working across it.
  let scroller = null

  const box = element('div', 'editor')

  const change = (next) => {
    current = next
    dirty = true
    notice = null
    chosen = new Set()
    anchor = null
    onChange?.(current)
    paint()
  }

  /** A field of the heading or the specification, committed when the caret leaves it. */
  const amend = (fields) => change({ ...current, ...fields })

  const rename = (title) => amend({ title })

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

  function paint() {
    const faults = validate(current)
    const across = scroller?.scrollLeft ?? 0
    box.replaceChildren(
      ...[
        nameSection(current.title, rename),
        report(faults),
        selection(),
        table(),
        actions(faults),
        hint(faults),
        specification(current, {
          onYields: (text) => amend({ yields: text.trim() === '' ? null : text.trim() }),
          onNotes: (notes) => amend({ notes }),
          onPreparations: (lines) => amend({ preparations: lines.map(asPreparation) }),
        }),
      ].filter(Boolean),
    )
    // Only once it is on the page does it have anything to scroll.
    if (scroller) scroller.scrollLeft = across
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
   * What the ticked rows would become. It appears only when something is ticked, so the
   * table is quiet until the cook has said what they mean, and it names both halves of
   * the move: what goes in, and what that would take it out of.
   */
  function selection() {
    if (chosen.size === 0) return null
    const taken = claim(current, chosen)
    const { moved, emptied } = upheaval(current, taken)

    const go = element('button', 'go', `Process in step`)
    go.onclick = () => openStep(null, taken)

    const clear = button('Clear', () => {
      chosen = new Set()
      anchor = null
      paint()
    })

    const bar = element('div', 'bar chosen', undefined, [
      element('span', 'label', `${chosen.size} chosen`),
      element('span', 'takes', taken.map(label).join(' + ')),
      go,
      clear,
    ])

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
    const box = element('div', 'scroll')
    scroller = box
    box.append(
      renderGrid(grid, 1, {
        onPick: open,
        pickable,
        onChoose: choose,
        chosen: (node) => chosen.has(node),
        onAdd: () => openIngredient(null),
        onStep: () => openStep(null, chosen.size > 0 ? claim(current, chosen) : null),
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

  /* Opening a form. Which one a tap gets is decided by what was tapped. */

  function open(node) {
    if (node.kind === 'ingredient') return openIngredient(node)
    if (node.kind === 'step') return openStep(node)
    // A preparation is not a thing of its own: it belongs to a step, and is edited in
    // that step's form. One belonging to the recipe rather than to any step is written
    // in the specification, where the rest of what a person wrote is.
    const owner = parentOf(current, node)
    if (owner) openStep(owner)
  }

  /** A preparation the recipe owns has no form to open, so it is not offered as a tap. */
  function pickable(node) {
    return node.kind !== 'preparation' || Boolean(parentOf(current, node))
  }

  function openIngredient(node) {
    ingredientSheet({
      heading: node ? 'Ingredient' : 'New ingredient',
      fields: node ? fieldsOf(node) : {},
      save: {
        text: node ? 'Save' : 'Add',
        run: (fields) => change(node ? editIngredient(current, node, fields) : addIngredient(current, fields)),
      },
      again: node ? null : { text: 'Add and another', run: (fields) => change(addIngredient(current, fields)) },
      remove: node ? { text: 'Delete', run: () => drop(node) } : null,
    })
  }

  /**
   * Deleting climbs: a step left holding nothing goes too, and so can the step above it,
   * taking its verb, its note and its preparations. Adding a step already says what it
   * would disturb before it does it; deleting has to as well, because there is no undo.
   */
  function drop(node) {
    const swept = sweptBy(current, node)
    if (swept.length > 0) {
      const names = swept.map(label).join(', ')
      if (!confirm(`Deleting ${label(node)} leaves ${names} with nothing, so ${swept.length === 1 ? 'it goes' : 'they go'} too. Delete anyway?`))
        return
    }
    change(removeNode(current, node))
  }

  /**
   * A new step's inputs come from the rows that were ticked, so its form only asks what
   * the step *is*. With nothing ticked it falls back to asking with a list, which is the
   * same list editing a step uses: `+ Step` must not be a button that does nothing, and
   * a cook who has not worked out what the checkboxes are for still has a way through.
   */
  function openStep(node, taken = null) {
    stepSheet({
      heading: node ? 'Step' : 'New step',
      fields: node ? fieldsOf(node) : {},
      // The filter: what is still a root, plus, when editing, this step's own inputs.
      options: taken ? null : candidates(current, node),
      taking: taken ? summarise(taken) : null,
      save: {
        text: node ? 'Save' : 'Add',
        run: (fields) =>
          change(
            node
              ? editStep(current, node, fields)
              : addStep(current, { ...fields, inputs: taken ?? fields.inputs }),
          ),
      },
      remove: node ? { text: 'Delete', run: () => drop(node) } : null,
    })
  }

  function summarise(taken) {
    const { moved, emptied } = upheaval(current, taken)
    return {
      inputs: taken.map(label),
      moved: moved.map(({ node, from }) => `${label(node)} comes out of ${label(from)}`),
      emptied: emptied.map((step) => `${label(step)} is left empty, so it goes too`),
    }
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
