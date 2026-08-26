const PREFIX = 'lekka:'

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
