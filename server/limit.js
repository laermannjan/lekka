/**
 * How often one source may do a thing, counted in fixed windows. Every limit is off
 * unless set, and a Map in one process, the way `alone()` in `http.js` already is.
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
    /** Whether this source has spent its budget. Charges nothing. */
    spent(who) {
      if (!(most > 0)) return false
      roll()
      return (counts.get(who) ?? 0) >= most
    },

    /** Charge one, and say whether the source is still inside its budget. */
    charge(who) {
      if (!(most > 0)) return true
      roll()
      // A table with no ceiling is what a limiter is for, so the one too many is refused.
      if (counts.size >= SOURCES && !counts.has(who)) return false
      const count = (counts.get(who) ?? 0) + 1
      counts.set(who, count)
      return count <= most
    },
  }
}

/** The socket, unless a proxy is trusted: an unasked-for forwarded header is a limit
 * anyone walks around by typing a different name into it. */
export function source(request, trustProxy) {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for']
    if (forwarded) return forwarded.split(',')[0].trim()
  }
  return request.socket?.remoteAddress ?? 'unknown'
}
