const PREFIX = 'lekka:'
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'

/** Ten characters, no look-alikes, every character equally likely. */
export function newId(length = 10) {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  let id = ''
  while (id.length < length) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1))
    if (byte < limit) id += ALPHABET[byte % ALPHABET.length]
  }
  return id
}

export function ids() {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(PREFIX))
    .map((key) => key.slice(PREFIX.length))
}

export function read(id) {
  return localStorage.getItem(PREFIX + id)
}

export function keep(id, text) {
  localStorage.setItem(PREFIX + id, text)
}

export function drop(id) {
  localStorage.removeItem(PREFIX + id)
}
