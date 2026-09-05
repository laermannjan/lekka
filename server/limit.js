/**
 * How often one source may do a thing, counted in fixed windows.
 *
 * A household network needs none of this and gets none: unset, every limit is off and
 * the server behaves exactly as it did. On a public address two acts are the whole
 * surface - making records, and guessing links - so those two are counted and nothing
 * else is, because every other request is the app doing its ordinary work.
 *
 * A Map in one process, which is honest about the deployment: `alone()` in `http.js` is
 * already a Map, so a second instance behind a load balancer breaks the write chain
 * before it breaks this. Say one process, or say neither.
 */

/** Distinct sources held in one window. Full is refused, never grown. */
const SOURCES = 20000

export function limiter({ every, most }) {
  let window = -1
  let counts = new Map()

  const roll = () => {
    const now = Math.floor(Date.now() / every)
    if (now === window) return
    window = now
    counts = new Map()
  }

  return {
    /** Whether this source has already spent its budget. Charges nothing. */
    spent(who) {
      if (!(most > 0)) return false
      roll()
      return (counts.get(who) ?? 0) >= most
    },

    /** Charge one, and say whether the source is still inside its budget. */
    charge(who) {
      if (!(most > 0)) return true
      roll()
      // A table with no ceiling is the thing a limiter is there to prevent, so a source
      // that would be the one too many is refused rather than remembered.
      if (counts.size >= SOURCES && !counts.has(who)) return false
      const count = (counts.get(who) ?? 0) + 1
      counts.set(who, count)
      return count <= most
    },
  }
}

/**
 * Who is asking.
 *
 * The socket, unless a proxy is trusted by configuration. A forwarded header believed
 * without being asked for is a limiter anyone walks around by typing a different name
 * into it, so trusting one is a thing the operator says out loud or not at all.
 */
export function source(request, trustProxy) {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for']
    if (forwarded) return forwarded.split(',')[0].trim()
  }
  return request.socket?.remoteAddress ?? 'unknown'
}
