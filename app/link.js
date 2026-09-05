/**
 * The shape of a link, in the one place that knows it.
 *
 * The id is in the path because the server needs it: it names the file, and it is what
 * the link is about. The key is in the fragment, which no browser sends anywhere - not
 * in the request line, not in a `Referer` - so it reaches no access log, no proxy and no
 * CDN. A key in the path is a key in every log between the phone and the disk, and
 * `Referrer-Policy: no-referrer` only stops it leaking onward, never inward.
 */

const CARD = /^\/r\/([^/]+)(?:\/([^/]+))?/
const COLLECTION = /^\/c\/([^/]+)(?:\/([^/]+))?/

export function address(stem, id, key) {
  return key ? `${stem}${id}#${key}` : `${stem}${id}`
}

/**
 * Where we are, and what we hold.
 *
 * Links handed out before the key moved carry it in the path. Those are still read, and
 * rewritten on arrival - so a bookmark keeps its rights and stops repeating the secret,
 * and the address bar of a device that already has one is cleaned the next time it opens.
 */
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
