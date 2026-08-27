export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
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
    },
  })
  if (!response.ok) throw new ApiError(response.status, await response.text())
  return response
}
