import { splitAside } from './card.js'
import { buildForest } from './grid.js'
import { renderGrid } from './render.js'
import { ingredientSheet, stepSheet, cardSheet } from './sheet.js'
import {
  candidates, parentOf, fieldsOf, validate, label, storedForm, beneath,
  addIngredient, addStep, editIngredient, editStep, removeNode, claim, upheaval,
} from './edit.js'

/**
 * Writing a card: two buttons that add, a table you can tap, and a list of what is
 * still wrong.
 *
 * The screen is the draft made visible. A finished card is one tree, so it draws as one
 * table; half-written it is several strands, so it draws as several, and joining them is
 * plainly the thing left to do. Nothing here decides what may be joined to what - that
 * is `edit.js`, where it can be tested - and nothing here parses. The editor only ever
 * asks the model a question and draws the answer.
 *
 * It owns its own redraw. Everything else in the app rebuilds the screen from the link,
 * which would mean re-reading the card from the server and losing the draft, so the
 * editor is one element that repaints itself and hands back a card only when saved.
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
    box.replaceChildren(
      ...[toolbar(faults), report(faults), selection(), table(), hint(faults)].filter(Boolean),
    )
  }

  function toolbar(faults) {
    const head = button('Card', openCard)

    const save = element('button', 'go', 'Save')
    save.disabled = faults.length > 0 || !dirty
    save.onclick = async () => {
      save.disabled = true
      const failed = await commit()
      // A write that arrives is said as plainly as one that does not: without a word
      // either way there is no telling a saved card from a card the server refused.
      notice = failed ? { text: failed, bad: true } : { text: 'Saved.', bad: false }
      paint()
    }

    const leave = button('Close', () => {
      if (dirty && !confirm('Leave without saving? The changes are lost.')) return
      onClose()
    })

    return element('div', 'bar', undefined, [
      element('span', 'label', 'Write'), head, save, leave,
    ])
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
  async function commit() {
    const text = storedForm(current)
    if (text === null) return 'This card does not come back the same when stored. Nothing was saved.'
    const failed = await onSave(text)
    if (failed) return failed
    dirty = false
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
    box.append(
      renderGrid(grid, 1, {
        onPick: open,
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
        ? 'Give the card a title, then add the first ingredient.'
        : 'Add an ingredient, then a step that takes it.',
    )
  }

  /* Opening a form. Which one a tap gets is decided by what was tapped. */

  function open(node) {
    if (node.kind === 'ingredient') return openIngredient(node)
    if (node.kind === 'step') return openStep(node)
    // A preparation is not a thing of its own: it belongs to a step, or to the card.
    const owner = parentOf(current, node)
    return owner ? openStep(owner) : openCard()
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
      remove: node ? { text: 'Delete', run: () => change(removeNode(current, node)) } : null,
    })
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
      remove: node
        ? { text: 'Delete', run: () => change(removeNode(current, node)) }
        : null,
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

  function openCard() {
    cardSheet({
      heading: 'The card',
      fields: {
        title: current.title,
        yields: current.yields,
        notes: current.notes,
        preparations: current.preparations.map((prep) =>
          prep.aside ? `${prep.text} (${prep.aside})` : prep.text,
        ),
      },
      save: {
        text: 'Save',
        run: (fields) =>
          change({
            ...current,
            title: fields.title.trim(),
            yields: fields.yields.trim() === '' ? null : fields.yields.trim(),
            notes: fields.notes,
            preparations: fields.preparations.map(asPreparation),
          }),
      },
    })
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
