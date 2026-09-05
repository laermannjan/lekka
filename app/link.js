/** The shape of a link: the id in the path, which the server needs, and the grant token
 * in the fragment, which no browser sends anywhere. */

const CARD = /^\/r\/([^/]+)(?:\/([^/]+))?/

export function address(id, token) {
  return token ? `/r/${id}#${token}` : `/r/${id}`
}

/** Where we are, and what we were sent. Links written before the token moved carry it as
 * a path segment; those are read, and rewritten. */
export function arrive() {
  const path = location.pathname
  const held = location.hash.length > 1 ? location.hash.slice(1) : null

  const found = CARD.exec(path)
  if (found) {
    const [, id, inPath] = found
    const token = inPath ?? held
    if (inPath) history.replaceState(null, '', address(id, token))
    return { kind: 'card', id, token, path: `/r/${id}` }
  }

  return { kind: null, path }
}
