import { duration, facts, mass, volume } from './facts.js'

/**
 * The furniture every screen is built out of: a heading with a dashed rule under it, and
 * the block of facts that closes a recipe.
 *
 * It lives here rather than in `main.js` because the editor draws its own screen. The
 * editor owns its repaint - everything else in the app rebuilds from the link, which
 * would mean re-reading the recipe and losing the draft - so it has to be able to draw a
 * heading and a specification without going back through the router.
 */

/**
 * A name, and a dashed rule out to the edge of the sheet.
 *
 * What the recipe yields is said beside the name, which is where the format itself puts
 * it (`# Roggenquarkbrot (1 Kastenbrot)`). It used to be a row of the specification, and
 * a recipe that says what it makes should say so where it says what it is.
 */
export function section(title, yields = null) {
  // Inside the name's own box, not under it: the heading is one line high whether it is
  // read or written, so `Edit` does not move the table down by the height of a second.
  const name = element('span', 'title', title)
  if (yields) name.append(element('span', 'yields', yields))
  return element('div', 'section', undefined, [name])
}

/**
 * The same heading with the name opened as a field. Writing a recipe opens its name
 * along with its table: it is the one word every recipe has, and it used to be reachable
 * only through a form of its own.
 */
export function nameSection(title, onRename) {
  const field = element('input', 'title')
  field.type = 'text'
  field.value = title ?? ''
  field.placeholder = 'Name'
  // A recipe with no name yet is one that was just started, and the name is the only
  // thing it is waiting for. `Create` opens the editor and the caret is already here.
  if (!title) field.autofocus = true
  // On change rather than on input, for the reason the specification's fields are: the
  // name is part of the screen, and rebuilding the screen under the caret would throw it.
  // Trimmed, as every other field of the card is. `formatCard` writes the name and
  // `parseCard` reads it back trimmed, so a trailing space is a card that does not come
  // back the same when stored - which Save refuses, without saying which field did it.
  field.onchange = () => onRename(field.value.trim())
  return element('div', 'section', undefined, [field])
}

/**
 * What the card says about itself.
 *
 * Read, that is its notes and nothing else. It held a block of sums as well - how long
 * the recipe takes, what it weighs, how many rows and steps it has - and they were
 * true, and nobody needed them. A cook reads the table; a count of the rows in it is a
 * fact about the drawing rather than about the food.
 *
 * Written, every one of them is a field, because this is the only place the yield, the
 * notes and the recipe's own preparations can be typed. The sums come back with them:
 * while a recipe is being written they are the one place the arithmetic is checked.
 */
export function specification(card, edit = null) {
  const found = facts(card)
  // Being written, each list offers one more line than it has, so a note or a
  // preparation can be added by typing into the empty one.
  const notes = edit ? [...card.notes, ''] : card.notes
  const preparations = (card.preparations ?? []).map(written)
  const preps = edit ? [...preparations, ''] : preparations

  const sums = edit
    ? [
        ...pair('Yield', card.yields ?? '', (text) => edit.onYields(text)),
        ...pair('Time', duration(found.minutes)),
        ...pair('Weight', mass(found.grams)),
        ...pair('Liquid', volume(found.millilitres)),
        ...pair('Ingredients', count(found.ingredients)),
        ...pair('Steps', count(found.steps)),
      ]
    : []

  const rows = [
    ...sums,
    ...notes.flatMap((note, index) =>
      pair(
        notes.length > 1 ? `Note ${index + 1}` : 'Note',
        note,
        edit && ((text) => edit.onNotes(replace(card.notes, index, text))),
      ),
    ),
    ...(edit
      ? preps.flatMap((prep, index) =>
          pair(
            preps.length > 1 ? `Before ${index + 1}` : 'Before',
            prep,
            (text) => edit.onPreparations(replace(preparations, index, text)),
          ),
        )
      : []),
  ]

  if (rows.length === 0) return null
  // The grid runs two pairs to a line; an odd count would leave the last line open.
  if (rows.length % 2) rows.push({ label: element('span', 'label'), value: element('span', 'value') })

  return element('div', '', undefined, [
    section(edit ? 'Specification' : 'Notes'),
    element('div', 'spec', undefined, rows.flatMap(({ label, value }) => [label, value])),
  ])
}

/** A label and its value, or nothing at all when there is no value and no field. */
function pair(name, text, onChange = null) {
  if (!onChange && !text) return []
  const label = element('span', 'label', name)
  const value = element('span', 'value')
  if (onChange) {
    const field = element('input')
    field.type = 'text'
    field.value = text ?? ''
    // On change, not on input: a preparation typed here is a row of the table, so the
    // screen has to be rebuilt to show it, and rebuilding it under the caret after every
    // keystroke would throw the caret to the end of the value.
    field.onchange = () => onChange(field.value)
    value.append(field)
  } else {
    value.textContent = text
  }
  return [{ label, value }]
}

/** A count, or nothing at all: a recipe with no steps yet is not a recipe with 0 steps. */
function count(number) {
  return number ? String(number) : ''
}

/** A preparation as one line, the way the format writes it. */
function written(prep) {
  return prep.aside ? `${prep.text} (${prep.aside})` : prep.text
}

/** The list with one of them changed, and the empty ones dropped. */
function replace(notes, index, text) {
  const next = [...notes]
  next[index] = text
  return next.map((note) => note.trim()).filter(Boolean)
}

function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children)
  return node
}
