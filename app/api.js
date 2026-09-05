export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** What this instance is, and who the browser is on it. Answers in every mode. */
export async function me() {
  const response = await fetch('/api/me')
  if (response.status === 404) return { mode: 'NONE', empty: false, person: null, session: null }
  if (!response.ok) throw new ApiError(response.status, await response.text())
  return response.json()
}

export async function signIn(name, password) {
  return send('POST', '/api/sessions', { body: JSON.stringify({ name, password }) })
}

export async function signOut() {
  return send('DELETE', '/api/sessions')
}

/** What a join link is for, before anybody acts on it. */
export async function invite(token) {
  return send('GET', `/api/invites/${token}`)
}

/** Made by anybody already inside, for somebody who is not here yet. */
export async function makeInvite() {
  return send('POST', '/api/invites', { body: '{}' })
}

/** Everybody here. Any signed-in person may ask, because that is who they can share with. */
export async function people() {
  return send('GET', '/api/people')
}

/** Only the person who keeps the instance. What they owned comes to whoever removes them. */
export async function removePerson(id) {
  return send('DELETE', `/api/people/${id}`)
}

/** Spending one: where somebody new picks the name and password they sign in with. */
export async function redeem(token, who) {
  return send('POST', `/api/invites/${token}`, { body: JSON.stringify(who) })
}

export async function sessions() {
  return send('GET', '/api/sessions')
}

export async function revokeSession(id) {
  return send('DELETE', `/api/sessions/${id}`)
}

/** The library: every recipe here, or the ones you hold, depending on the instance. */
export async function cards() {
  return send('GET', '/api/cards')
}

export async function createCard(text) {
  return send('POST', '/api/cards', { body: text })
}

/**
 * A token is only ever the grant on a link somebody sent you. Your own recipes need
 * none: the server already knows they are yours.
 */
export async function readCard(id, token) {
  return send('GET', `/api/cards/${id}`, { token, text: true })
}

export async function writeCard(id, text, token) {
  return send('PUT', `/api/cards/${id}`, { token, body: text })
}

/** Who holds this recipe. Only its owner may ask, and a 404 is how the server says so. */
export async function grantsOn(id) {
  return send('GET', `/api/cards/${id}/grants`)
}

/**
 * Hand it to somebody. A name makes a grant that person holds; no name mints a link,
 * and the token comes back exactly once.
 */
export async function share(id, { name = null, scope = 'read', days = null } = {}) {
  return send('POST', `/api/cards/${id}/grants`, { body: JSON.stringify({ name, scope, days }) })
}

export async function revokeGrant(id) {
  return send('DELETE', `/api/grants/${id}`)
}

export async function deleteCard(id, token) {
  return send('DELETE', `/api/cards/${id}`, { token })
}

async function send(method, path, options) {
  const response = await call(method, path, options)
  if (response.status === 204) return null
  return options?.text ? response.text() : response.json()
}

async function call(method, path, { token, body } = {}) {
  const response = await fetch(path, {
    method,
    body,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      // A cookie is sent whether or not the page meant to ask, so a write says out loud
      // that it came from here. No cross-site form can set a header, and the preflight
      // this forces is one a stranger's page cannot satisfy.
      ...(method === 'GET' ? {} : { 'x-lekka': '1' }),
    },
  })
  if (!response.ok) throw new ApiError(response.status, await response.text())
  return response
}
