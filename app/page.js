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

/** A name, and a dashed rule out to the edge of the sheet. */
export function section(title) {
  return element('div', 'section', undefined, [element('span', 'title', title)])
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
 * What the app knows about the recipe on the screen.
 *
 * Only what is worth reading. Row counts and byte counts describe the drawing rather
 * than the food, and a box repeating what the table beside it already shows is the kind
 * of decoration this is meant to avoid. A row with no answer for this recipe is left out
 * rather than filled with a dash - ribs are measured in racks and cups, and a weight of
 * nothing is noise.
 *
 * Rows a person wrote become fields while the recipe is being written; rows worked out
 * from it stay text, because there is nothing to type into a sum.
 */
export function specification(card, edit = null) {
  const found = facts(card)
  // Being written, each list offers one more line than it has, so a note or a
  // preparation can be added by typing into the empty one.
  const notes = edit ? [...card.notes, ''] : card.notes
  const preparations = (card.preparations ?? []).map(written)
  const preps = edit ? [...preparations, ''] : preparations

  const rows = [
    ...pair('Yield', card.yields ?? '', edit && ((text) => edit.onYields(text))),
    ...pair('Time', duration(found.minutes)),
    ...pair('Weight', mass(found.grams)),
    ...pair('Liquid', volume(found.millilitres)),
    ...pair('Ingredients', count(found.ingredients)),
    ...pair('Steps', count(found.steps)),
    ...notes.flatMap((note, index) =>
      pair(
        notes.length > 1 ? `Note ${index + 1}` : 'Note',
        note,
        edit && ((text) => edit.onNotes(replace(card.notes, index, text))),
      ),
    ),
    ...preps.flatMap((prep, index) =>
      pair(
        preps.length > 1 ? `Before ${index + 1}` : 'Before',
        prep,
        edit && ((text) => edit.onPreparations(replace(preparations, index, text))),
      ),
    ),
  ]

  if (rows.length === 0) return null
  // The grid runs two pairs to a line; an odd count would leave the last line open.
  if (rows.length % 2) rows.push({ label: element('span', 'label'), value: element('span', 'value') })

  return element('div', '', undefined, [
    section('Specification'),
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
