import { address } from './link.js'

/**
 * The library, as a table.
 *
 * A row has one fact and one act: what the recipe is called, and deleting it. There used
 * to be two acts, because a recipe could be taken out of a collection without being
 * destroyed - but a recipe now belongs to whoever made it rather than to a list, so
 * "remove" had nothing left to mean.
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
    table.append(element('span', 'none', 'No recipes yet.'), ...(onDelete ? [element('span')] : []))

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
  return (acts ? ['Recipe', 'Delete'] : ['Recipe']).map((name) => element('span', 'label', name))
}

/**
 * A recipe somebody only let you read is still yours to open, and not yours to destroy.
 * The cell is left empty rather than holding a control that would only refuse. Where
 * nothing is owned at all no scope comes back, and everyone may delete everything.
 */
function row({ id, scope, card }, { onDelete }) {
  const link = element('a', 'name', card ? card.title : id)
  link.href = address(id)
  const name = element('span', 'card')
  name.append(link)

  if (!onDelete) return [name]

  const erase = element('span')
  if (scope === undefined || scope === 'owner')
    erase.append(button('Delete', 'danger', () => onDelete(id, card)))
  else erase.append(element('span', 'none', scope === 'edit' ? 'shared with you' : 'read only'))
  return [name, erase]
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
