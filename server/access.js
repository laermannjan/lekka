export const COOKIE = 'lekka'

const MODES = ['public', 'private', 'secret']
const YEAR = 365 * 24 * 60 * 60

/** An unknown mode is a typo, and a typo must not quietly open an instance. */
export function mode(value) {
  const wanted = (value ?? 'public').trim().toLowerCase()
  if (!MODES.includes(wanted)) throw new Error(`ACCESS must be one of ${MODES.join(', ')}`)
  return wanted
}

/**
 * The whole permission rule, in one place so no route can disagree with another.
 *
 * `public` is today's instance unchanged: the link is the only credential, and whoever
 * can reach the port may read. `private` puts the door behind a sign-in and leaves
 * everything inside shared. `secret` adds ownership, and keeps the key as the way a
 * single card is handed to somebody who has no account here.
 */
export function may(mode, session, owner, held) {
  if (mode === 'public') return true
  if (!session) return false
  if (mode === 'private') return true
  return owner === null || owner === session.person || held
}

/** Making things is a member's right, never a passer-by's, once there is a door. */
export function mayCreate(mode, session) {
  return mode === 'public' || Boolean(session)
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
 * header no cross-site form can set. A client holding a bearer token has no ambient
 * authority to abuse and is left alone.
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
