/** The shape of a link: the id in the path, which the server needs, the key in the
 * fragment, which no browser sends anywhere. */

const CARD = /^\/r\/([^/]+)(?:\/([^/]+))?/
const COLLECTION = /^\/c\/([^/]+)(?:\/([^/]+))?/

export function address(stem, id, key) {
  return key ? `${stem}${id}#${key}` : `${stem}${id}`
}

/** Where we are, and what we hold. Links written before the key moved carry it as a
 * path segment; those are read, and rewritten. */
export function arrive() {
  const path = location.pathname
  const held = location.hash.length > 1 ? location.hash.slice(1) : null

  for (const [kind, pattern, stem] of [
    ['card', CARD, '/r/'],
    ['collection', COLLECTION, '/c/'],
  ]) {
    const found = pattern.exec(path)
    if (!found) continue
    const [, id, inPath] = found
    const key = inPath ?? held
    if (inPath) history.replaceState(null, '', address(stem, id, key))
    return { kind, id, key, path: stem + id }
  }

  return { kind: null, path }
}
