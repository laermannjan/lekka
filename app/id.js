const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz'

/** Lower case so a case-blind filesystem cannot merge two ids. No look-alikes. */
export function newId(length = 10) {
  const limit = Math.floor(256 / ALPHABET.length) * ALPHABET.length
  let id = ''
  while (id.length < length) {
    const [byte] = crypto.getRandomValues(new Uint8Array(1))
    if (byte < limit) id += ALPHABET[byte % ALPHABET.length]
  }
  return id
}
