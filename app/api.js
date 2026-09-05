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

/** The first person on an instance, admitted by the link the operator read in the logs. */
export async function firstPerson(name, password, token) {
  return send('POST', '/api/people', { body: JSON.stringify({ name, password, token }) })
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
