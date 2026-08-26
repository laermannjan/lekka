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

export async function createCollection(rows = []) {
  return send('POST', '/api/collections', { body: JSON.stringify(rows) })
}

export async function readCollection(id, key) {
  return send('GET', `/api/collections/${id}`, { key })
}

export async function writeCollection(id, key, rows) {
  return send('PUT', `/api/collections/${id}`, { key, body: JSON.stringify(rows) })
}

async function send(method, path, { key, body, text } = {}) {
  const response = await fetch(path, {
    method,
    body,
    headers: key ? { authorization: `Bearer ${key}` } : {},
  })
  if (!response.ok) throw new ApiError(response.status, await response.text())
  if (response.status === 204) return null
  return text ? response.text() : response.json()
}
