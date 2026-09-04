import { label, beneath } from './edit.js'

/**
 * One form at a time, over the recipe, from the bottom of the screen.
 *
 * A phone in a kitchen has room for the table or for a form, never both, and the table is
 * what the form is about: you want to see the strand you are joining while you say what
 * joins it. So the form comes up over the card rather than beside it, and goes away
 * again the moment it is done.
 *
 * It is a real `dialog`, opened modally, because that already does the four things a
 * hand-built overlay gets wrong: it takes the focus, it keeps the focus inside itself,
 * escape closes it, and what is behind it cannot be clicked. None of that is styling,
 * so none of it can be undone by a stylesheet.
 */
function sheet(heading, build, { save, remove, again = null }) {
  const box = document.createElement('dialog')
  // Not `sheet`: the sharing dialog owns that class, and two dialogs sharing one class
  // means whichever stylesheet rule comes last decides how both of them look.
  box.className = 'compose'

  const form = element('form', 'body')
  form.method = 'dialog'
  form.append(element('h2', 'heading', heading))

  const read = build(form)

  const done = element('button', 'go', save.text)
  done.type = 'submit'

  const cancel = element('button', 'quiet', 'Cancel')
  cancel.type = 'button'
  cancel.onclick = () => box.close()

  const actions = element('div', 'actions')
  actions.append(done)
  if (again) {
    const more = element('button', 'quiet', again.text)
    more.type = 'button'
    // Entering a recipe is entering a list of ingredients. Closing the sheet after each
    // one would make the second one cost a tap more than the first.
    more.onclick = () => {
      again.run(read())
      form.reset()
      form.querySelector('input, textarea')?.focus()
    }
    actions.append(more)
  }
  if (remove) {
    const drop = element('button', 'quiet warn', remove.text)
    drop.type = 'button'
    drop.onclick = () => {
      remove.run()
      box.close()
    }
    actions.append(drop)
  }
  actions.append(cancel)
  form.append(actions)

  form.onsubmit = () => save.run(read())
  box.onclose = () => box.remove()

  box.append(form)
  document.body.append(box)
  box.showModal()
  form.querySelector('input, textarea')?.focus()
  return box
}

/** Amount, unit, name, note - one line of the card, in the order the line has them. */
export function ingredientSheet({ fields = {}, heading, save, remove, again }) {
  return sheet(
    heading,
    (form) => {
      const amount = field(form, 'Amount', fields.amount, { inputMode: 'decimal', width: 'short' })
      const unit = field(form, 'Unit', fields.unit, { width: 'short' })
      const name = field(form, 'Name', fields.name)
      const note = field(form, 'Note', fields.aside, { hint: 'Type 550, finely chopped' })
      return () => ({
        amount: amount.value,
        unit: unit.value,
        name: name.value,
        aside: note.value,
      })
    },
    { save, remove, again },
  )
}

/**
 * Instruction, note, preparations, and what goes in.
 *
 * The list of inputs is the one place this screen has a rule of its own, and it is not
 * a rule about forms: what is already an input to something has a parent and is not
 * offered, so the list can only ever show what is genuinely still loose. The caller
 * works that out; here it is only drawn.
 */
export function stepSheet({ fields = {}, options = null, taking = null, heading, save, remove }) {
  return sheet(
    heading,
    (form) => {
      const verb = field(form, 'Instruction', fields.verb, { hint: 'verrühren, backen' })
      const note = field(form, 'Note', fields.aside, { hint: '2 min je Seite' })
      const preps = area(form, 'Preparations', (fields.preparations ?? []).join('\n'), {
        hint: 'one per line, each done before this step',
      })
      const boxes = taking ? taken(form, taking) : inputList(form, options, fields.inputs ?? [])
      return () => ({
        verb: verb.value,
        aside: note.value,
        preparations: preps.value.split('\n').map((line) => line.trim()).filter(Boolean),
        inputs: boxes.filter((box) => box.input.checked).map((box) => box.node),
      })
    },
    { save, remove },
  )
}

/**
 * What the ticked rows came to, read back rather than asked again. The move is already
 * decided by the table; the form's job is to let it be seen before it happens, and what
 * most needs seeing is the half that was not pointed at.
 */
function taken(form, { inputs, moved, emptied }) {
  const wrap = element('div', 'row wide')
  wrap.append(element('label', 'name', 'Goes in'))

  const list = element('div', 'inputs')
  for (const text of inputs) list.append(element('div', 'choice taken', text))
  wrap.append(list)

  for (const text of [...moved, ...emptied]) wrap.append(element('p', 'hint warn', `${text}.`))
  form.append(wrap)
  return []
}

/** The list of things a step may take, as checkboxes. */
function inputList(form, options, chosen) {
  if (!options) return []
  const wrap = element('div', 'row wide')
  wrap.append(element('label', 'name', 'Goes in'))

  if (options.length === 0) {
    wrap.append(element('p', 'hint', 'Nothing is waiting. Add an ingredient first.'))
    form.append(wrap)
    return []
  }

  const list = element('div', 'inputs')
  const boxes = options.map((node) => {
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = chosen.includes(node)

    const line = element('label', `choice ${node.kind}`)
    const text = element('span', 'what', label(node))
    line.append(input, text)

    // A step is recognised by what it has gathered, not by its verb alone: two cards
    // can both say "verrühren" and the cook needs to know which bowl this is.
    const carries = node.kind === 'step' ? beneath(node).map((one) => one.name) : []
    if (carries.length > 0) line.append(element('span', 'aside', carries.join(', ')))

    list.append(line)
    return { node, input }
  })

  wrap.append(list)
  form.append(wrap)
  return boxes
}

function field(form, name, value, { hint, inputMode, width } = {}) {
  const input = document.createElement('input')
  input.type = 'text'
  input.value = value ?? ''
  if (inputMode) input.inputMode = inputMode
  return labelled(form, name, input, hint, width)
}

function area(form, name, value, { hint } = {}) {
  const input = document.createElement('textarea')
  input.rows = 2
  input.value = value ?? ''
  return labelled(form, name, input, hint, 'wide')
}

function labelled(form, name, input, hint, width) {
  const line = element('label', `row ${width === 'short' ? 'short' : 'wide'}`)
  line.append(element('span', 'name', name), input)
  if (hint) line.append(element('span', 'hint', hint))
  form.append(line)
  return input
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
