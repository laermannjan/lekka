/**
 * The collection, as a table.
 *
 * A row has one fact and two acts: what the recipe is called, and the two things you can
 * do to it that are not the same thing. `Delete` takes the recipe away from everyone
 * holding its link; `Remove` only takes it out of this collection and leaves it standing.
 * Colour says which is which before the words are read.
 *
 * It once carried the recipe's id, its key and its yield as well. All three were true
 * and none was worth a column: the id and the key are in the address bar of the recipe
 * they belong to, and a yield is read while cooking, not while choosing what to cook.
 *
 * The last row is where the table grows, the way the last row of the editor's grid is
 * where a recipe grows. Two ways in, because a recipe either exists somewhere already or
 * it does not.
 */
export function renderOverview(entries, actions = {}) {
  const { onRemove, onDelete, onImport, onCreate } = actions
  const acts = Boolean(onRemove || onDelete)

  const table = element('div', acts ? 'records' : 'records reading')
  table.append(...head(acts))

  if (entries.length === 0 && !onCreate)
    table.append(element('span', 'none', 'No recipes yet.'), ...blanks(acts))

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

function head(acts) {
  const names = acts ? ['Recipe', 'Delete', 'Remove'] : ['Recipe']
  return names.map((name) => element('span', 'label', name))
}

function blanks(acts) {
  return acts ? [element('span'), element('span')] : []
}

function row({ id, key, card }, { onRemove, onDelete }) {
  const link = element('a', 'name', card ? card.title : id)
  link.href = key ? `/r/${id}/${key}` : `/r/${id}`
  const name = element('span', 'card')
  name.append(link)

  if (!onRemove && !onDelete) return [name]

  const erase = element('span')
  // Destroying a recipe needs its key. Without one the cell is left empty rather than
  // holding a control that would only refuse.
  if (onDelete && key) erase.append(button('Delete', 'danger', () => onDelete(id, key, card)))
  else erase.append(element('span', 'none', 'no key'))

  const drop = element('span')
  if (onRemove) drop.append(button('Remove', 'warn', () => onRemove(id)))

  return [name, erase, drop]
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
