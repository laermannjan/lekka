/** One row per card link the collection holds. */
export function renderOverview(entries, actions = {}) {
  const list = element('div', 'list')
  if (entries.length === 0) list.append(element('div', 'row', 'No cards yet.'))
  for (const entry of entries) list.append(row(entry, actions))
  return list
}

function row({ id, key, card }, { onRemove, onDelete }) {
  const line = element('div', 'row')

  const link = element('a', 'name', card ? card.title : id)
  link.href = key ? `/r/${id}/${key}` : `/r/${id}`

  const badge = element('span', key ? 'badge own' : 'badge', key ? 'editable' : 'read only')
  const aside = element('span', 'aside', card?.yields ?? '')

  line.append(link, badge, aside)
  if (onRemove) {
    const remove = element('button', 'quiet', 'Remove')
    remove.onclick = () => onRemove(id)
    line.append(remove)
  }
  if (onDelete && key) {
    const erase = element('button', 'quiet', 'Delete')
    erase.onclick = () => onDelete(id, key, card)
    line.append(erase)
  }
  return line
}

function element(tag, className, text) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}
