/**
 * The furniture the screens still drawn as the datasheet are built out of: a heading with
 * a dashed rule under it, and what a grant is called where it is read.
 */

/**
 * What a grant's scope is called where it is read rather than enforced.
 *
 * The words the rows keep are the words the rules are written in - `edit` is a thing you
 * may do - and a tag is telling somebody what they are on a recipe, which is a thing you
 * are. `read` is `read-only` for the same reason: READ beside a tag saying GRANT reads
 * as a second setting rather than as a limit.
 *
 * Where nothing is owned anywhere no scope comes back at all, and everybody may do
 * everything, which is what owning it amounts to.
 */
const HOLDS = { owner: 'owner', edit: 'collaborator', read: 'read-only' }

export function hold(scope) {
  return HOLDS[scope ?? 'owner'] ?? scope
}

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

function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children)
  return node
}
