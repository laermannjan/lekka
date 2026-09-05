export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

/** What this instance is, and who the browser is on it. Answers on every mode. */
export async function me() {
  const response = await fetch('/api/me')
  if (response.status === 404) return { mode: 'public', empty: false, person: null, session: null }
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

export async function createCard(text) {
  return send('POST', '/api/cards', { body: text })
}

export async function readCard(id) {
  return send('GET', `/api/cards/${id}`, { text: true })
}

export async function writeCard(id, key, text) {
  return send('PUT', `/api/cards/${id}`, { key, body: text })
}

export async function deleteCard(id, key) {
  return send('DELETE', `/api/cards/${id}`, { key })
}

/** The shelves this person owns, which is how a new browser finds their library. */
export async function myCollections() {
  return send('GET', '/api/collections')
}

export async function createCollection(rows = []) {
  return send('POST', '/api/collections', { body: JSON.stringify(rows) })
}

/** Comes back with the version tag a later write has to name. */
export async function readCollection(id, key) {
  const response = await call('GET', `/api/collections/${id}`, { key })
  return { rows: await response.json(), version: response.headers.get('etag') }
}

export async function writeCollection(id, key, rows, version) {
  const response = await call('PUT', `/api/collections/${id}`, {
    key,
    body: JSON.stringify(rows),
    version,
  })
  return response.headers.get('etag')
}

async function send(method, path, options) {
  const response = await call(method, path, options)
  if (response.status === 204) return null
  return options?.text ? response.text() : response.json()
}

async function call(method, path, { key, body, version } = {}) {
  const response = await fetch(path, {
    method,
    body,
    headers: {
      ...(key ? { authorization: `Bearer ${key}` } : {}),
      ...(version ? { 'if-match': version } : {}),
      // A cookie is sent whether or not the page meant to ask, so a write says out loud
      // that it came from here. No cross-site form can set a header, and the preflight
      // this forces is one a stranger's page cannot satisfy.
      ...(method === 'GET' ? {} : { 'x-lekka': '1' }),
    },
  })
  if (!response.ok) throw new ApiError(response.status, await response.text())
  return response
}
