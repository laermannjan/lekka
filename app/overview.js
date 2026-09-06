import { address } from './link.js'
import { hold } from './page.js'

/**
 * The library, as a table.
 *
 * A row has two facts and one act: what the recipe is called, what you hold on it, and
 * deleting it. There used to be two acts, because a recipe could be taken out of a
 * collection without being destroyed - but a recipe now belongs to whoever made it
 * rather than to a list, so "remove" had nothing left to mean.
 *
 * It once carried the recipe's id, its key and its yield as well. None was worth a
 * column: the id is in the address bar of the recipe it belongs to, the key is gone, and
 * a yield is read while cooking, not while choosing what to cook.
 *
 * The last row is where the table grows, the way the last row of the editor's grid is
 * where a recipe grows. Two ways in, because a recipe either exists somewhere already or
 * it does not.
 */
export function renderOverview(entries, actions = {}) {
  const { onDelete, onImport, onCreate } = actions

  const table = element('div', onDelete ? 'records' : 'records reading')
  table.append(...head(Boolean(onDelete)))

  if (entries.length === 0 && !onCreate)
    table.append(
      element('span', 'none', 'No recipes yet.'),
      ...columns(Boolean(onDelete)).slice(1).map(() => element('span')),
    )

  for (const entry of entries) table.append(...row(entry, actions))

  if (onCreate || onImport) {
    const add = element('span', 'add')
    if (onImport) add.append(button('Import', 'go take', onImport))
    if (onCreate) add.append(button('Create', 'go make', onCreate))
    table.append(add)
  }

  const scroll = element('div', 'scroll')
  scroll.append(table)
  const box = element('div', 'sheetbox')
  box.append(scroll)
  return box
}

/*
 * The columns, named once. `.records` is a grid, so a row is laid out by the *count* of
 * cells and not by any markup saying "row": every row has to be exactly this long, the
 * empty one included, and the stylesheet has to name the same number.
 */
const columns = (acts) => (acts ? ['Recipe', 'Hold', 'Delete'] : ['Recipe'])

function head(acts) {
  return columns(acts).map((name) => element('span', 'label', name))
}

/**
 * A recipe somebody only let you read is still yours to open, and not yours to destroy.
 * The cell is left empty rather than holding a control that would only refuse. Where
 * nothing is owned at all no scope comes back, and everyone may delete everything.
 *
 * What you hold is a tag of its own rather than words in the Delete cell. It used to be
 * said there - "shared with you", "read only" - which was the same fact in the column
 * about what may be done to the recipe rather than in one about what you are on it, and
 * said nothing at all on the rows you own. A column says it about every row, in the
 * three words the foot uses for the recipe you are standing in.
 */
function row({ id, scope, card }, { onDelete }) {
  const link = element('a', 'name', card ? card.title : id)
  link.href = address(id)
  const name = element('span', 'card')
  name.append(link)

  if (!onDelete) return [name]

  const held = element('span')
  held.append(element('span', 'tag scope', hold(scope)))

  const erase = element('span')
  if (scope === undefined || scope === 'owner')
    erase.append(button('Delete', 'danger', () => onDelete(id, card)))
  return [name, held, erase]
}

function button(text, kind, run) {
  const node = element('button', kind.startsWith('go') ? kind : `quiet ${kind}`, text)
  node.type = 'button'
  node.onclick = run
  return node
}

function element(tag, className = '', text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
