/**
 * The shape of a link: the id, and nothing else. A recipe used to carry a secret in the
 * fragment - a key, and then a grant token - which is how it was opened by somebody who
 * held no account. Nothing is addressed to a string any more, so the address is a name.
 */

const CARD = /^\/r\/([^/]+)(?:\/([^/]+))?/

export function address(id) {
  return `/r/${id}`
}

/** Where we are. An older link with something trailing is read for its id and rewritten. */
export function arrive() {
  const path = location.pathname
  const found = CARD.exec(path)
  if (found) {
    const [, id, trailing] = found
    if (trailing || location.hash) history.replaceState(null, '', address(id))
    return { kind: 'card', id, path: address(id) }
  }
  return { kind: null, path }
}
