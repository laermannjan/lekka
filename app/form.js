import { fieldsOf, label, preparationLines } from './edit.js'
import { fit } from './render.js'

/**
 * The one thing being written, in a form over the page.
 *
 * Nothing is written in the table. A field is not the words it replaces - it wraps at a
 * different width - so a cell that opened where it stood reflowed the one piece of text
 * being looked at, and a column of boxes that came and went moved the rest. The table is
 * the table it is read as, to the pixel, and everything you can type is in here.
 *
 * The form is docked to the foot of the window rather than centred, so the head of the
 * table stays above it, and it is as tall as it needs to be. That is what a layer buys
 * over a panel in the page: a panel has to fit the room left over, and how much room is
 * left over depends on how long the recipe is.
 *
 * It is modal, with the page dimmed behind it. The cost is real and was chosen: while it
 * is open you cannot watch the shading change in the table, so the list of inputs has to
 * say on its own what each one brings.
 */
export function buildForm({ node, place, offers = [], onChoose, onApply, onDrop, onClose }) {
  const step = node.kind === 'step'
  const was = fieldsOf(node)
  const chosen = new Set(step ? was.inputs : [])

  const box = element('dialog', 'compose')
  const body = element('div', 'body')

  /*
   * What is open, and where it stands. Not its name: the name is in a field two lines
   * below, and a heading that repeats the field under it is one more thing to read and
   * one more thing to keep in step.
   */
  const at = element('div', 'at', undefined, [
    element('span', 'kind', step ? 'Step' : 'Ingredient'),
    element('span', 'spring'),
    element('span', 'place', place ?? ''),
  ])

  const fields = element('div', step ? 'rows forStep' : 'rows')
  const made = {}
  /* The fields that grow to what they hold. Only a textarea does: an input is one line
     and has a height, and measuring it to its own contents moved it off that height. */
  const grows = []

  const write = (key, name, value, wide = false) => {
    const one = element('label')
    const said = element('span', 'said', name)
    const field = document.createElement(wide ? 'textarea' : 'input')
    if (!wide) field.type = 'text'
    field.className = key
    field.value = value ?? ''
    if (wide) {
      field.rows = 1
      field.oninput = () => fit(field)
      grows.push(field)
    }
    one.append(said, field)
    fields.append(one)
    made[key] = field
    return field
  }

  if (step) {
    /*
     * One field per preparation and one more, so another is added by typing into it.
     * Above the verb, because that is when it happens.
     */
    made.before = [...preparationLines(node), ''].map((line, index) => {
      const field = write(`before before-${index}`, index === 0 ? 'Before it' : '', line, true)
      return field
    })
    write('verb', 'Step', was.verb, true)
    write('aside', 'Note', was.aside, true)
  } else {
    write('amount', 'Amount', was.amount)
    write('unit', 'Unit', was.unit)
    write('name', 'Name', was.name)
    write('aside', 'Qualifier', was.aside)
  }

  body.append(at, fields)

  /*
   * What goes into this step. A step takes whole strands, so what is offered is a strand
   * and never a row inside one: what goes into `vermengen` is `abkühlen`, not the
   * Roggenschrot three steps inside it.
   *
   * Each line says what it brings, but only where that is not obvious - an ingredient
   * brings its own row and saying so on every line of the list is a column of `1 row`.
   */
  let inputs = null
  if (step) {
    inputs = element('div', 'inputs')
    for (const one of offers) inputs.append(choice(one, chosen, onChoose))
    body.append(
      element('div', 'row wide', undefined, [
        element('span', 'name', 'Takes'),
        offers.length > 0
          ? inputs
          : element('span', 'hint', 'Nothing is free to go into this step.'),
      ]),
    )
  }

  const apply = element('button', 'go', 'Apply')
  apply.onclick = () => {
    const said = read()
    if (step && said.inputs.length === 0)
      return warn('A step has to take something. Tick what goes into it.')
    onApply(said)
  }

  const erase = element('button', 'quiet danger', 'Delete')
  erase.onclick = () => onDrop()

  const leave = element('button', 'quiet', 'Close')
  leave.onclick = () => onClose()

  const trouble = element('span', 'hint warn')
  const actions = element('div', 'actions', undefined, [apply, erase, element('span', 'spring'), leave])
  body.append(actions, trouble)
  box.append(body)

  // Escape and the backdrop close it, which is what a dialog does; both mean the same
  // thing as `Close`, so both go through the same door.
  box.addEventListener('cancel', (event) => {
    event.preventDefault()
    onClose()
  })

  function warn(text) {
    trouble.textContent = text
  }

  function read() {
    if (!step)
      return {
        fields: {
          amount: made.amount.value,
          unit: made.unit.value,
          name: made.name.value,
          aside: made.aside.value,
        },
      }
    return {
      fields: {
        verb: made.verb.value,
        aside: made.aside.value,
        preparations: made.before.map((one) => one.value.trim()).filter(Boolean),
      },
      inputs: [...chosen],
    }
  }

  /** The caret starts in the first field, which is the thing you came here to change. */
  box.settle = () => {
    for (const one of grows) fit(one)
    const first = step ? made.verb : made.amount
    first?.focus?.()
    first?.select?.()
  }

  return box
}

/**
 * One thing that may go into the step, with a box.
 *
 * It says what it brings only when that is worth saying. A step brings everything under
 * it and how much that is cannot be seen from its name; an ingredient brings its own one
 * row, and a list that says so on every line is a column of the word `row`.
 */
function choice(node, chosen, said) {
  const line = element('label', node.kind === 'step' ? 'choice strand' : 'choice')
  const tick = document.createElement('input')
  tick.type = 'checkbox'
  tick.checked = chosen.has(node)
  if (tick.checked) line.classList.add('taken')
  tick.onchange = () => {
    if (tick.checked) chosen.add(node)
    else chosen.delete(node)
    line.classList.toggle('taken', tick.checked)
    // The table under the form is told too. It is dimmed, not hidden - the form is
    // 640px at the foot of the window and the card is above it - and a table that went
    // on shading what the list no longer says would be a table telling a lie.
    said?.(chosen)
  }

  line.append(tick, element('span', 'what', label(node)))
  const rows = node.kind === 'step' ? count(node) : 0
  if (rows > 1) line.append(element('span', 'aside', `${rows} ingredients`))
  return line
}

function count(node) {
  if (node.kind === 'ingredient') return 1
  return (node.children ?? []).reduce((sum, child) => sum + count(child), 0)
}

function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children)
  return node
}
