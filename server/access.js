export const COOKIE = 'lekka'

const MODES = ['NONE', 'LOGIN', 'GRANT']
const YEAR = 365 * 24 * 60 * 60

/**
 * How much access control this instance does, named after the mechanism rather than how
 * secret it feels.
 *
 *   NONE   no door. Everyone who reaches the port reads, writes and deletes everything.
 *   LOGIN  one door. Everyone signed in reads, writes and deletes everything.
 *   GRANT  one door, and every recipe answers to a grant: yours, or one you were given.
 *
 * An unknown value is a typo, and a typo must not quietly open an instance.
 */
export function mode(value) {
  const wanted = (value ?? 'NONE').trim().toUpperCase()
  if (!MODES.includes(wanted)) throw new Error(`ACCESS_CONTROL must be one of ${MODES.join(', ')}`)
  return wanted
}

/** Whether there is anybody to be on this instance, which is what a door implies. */
export const guarded = (mode) => mode !== 'NONE'

/**
 * The whole permission rule, in one place so no route can disagree with another. Under
 * `GRANT` the answer is a row, and `grants.may` is what reads it.
 */
export function may(mode, session, asked) {
  if (mode === 'NONE') return true
  if (mode === 'LOGIN') return Boolean(session)
  // Under GRANT the row is the whole answer, and being signed in is not part of the
  // question: a link grant exists precisely so somebody with no account here can open
  // the one recipe they were sent.
  return asked()
}

/** Making things is a member's right, never a passer-by's, once there is a door. */
export function mayCreate(mode, session) {
  return mode === 'NONE' || Boolean(session)
}

export function cookie(request, name) {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=')
    if (at < 0) continue
    if (part.slice(0, at).trim() === name) return part.slice(at + 1).trim() || null
  }
  return null
}

/**
 * `Secure` only where the connection is one. lekka's README points people at a LAN over
 * plain HTTP, and a cookie the browser refuses to store is a login that cannot be
 * finished. Behind a terminating proxy the forwarded scheme decides it, and only when the
 * operator has said that proxy may be believed.
 */
export function keep(token, secure) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax;${secure ? ' Secure;' : ''} Max-Age=${YEAR}`
}

export function clear(secure) {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax;${secure ? ' Secure;' : ''} Max-Age=0`
}

export function encrypted(request, trustProxy) {
  if (request.socket?.encrypted) return true
  if (!trustProxy) return false
  return (request.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https'
}

/**
 * A cookie is sent by the browser whether or not the page meant to ask, so a write that
 * leans on one must prove it came from our own page: an `Origin` that matches, and a
 * header no cross-site form can set. A client holding a token has no ambient authority
 * to abuse and is left alone.
 */
export function forged(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return false

  const sent = request.headers.origin
  if (sent) {
    const host = request.headers.host
    try {
      if (!host || new URL(sent).host !== host) return true
    } catch {
      return true
    }
  }

  return Boolean(cookie(request, COOKIE)) && request.headers['x-lekka'] !== '1'
}
