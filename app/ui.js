/**
 * The few parts every screen is built from. Icons are drawn here as strokes, the way the
 * system draws its own, and carry no meaning of their own: a button that is only an icon
 * says what it does in its label.
 */

const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="5" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.8" fill="currentColor" stroke="none"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  share: '<path d="M12 3v12M7 8l5-5 5 5M5 13v7h14v-7"/>',
  paste: '<path d="M9 4h6v3H9zM7 5H5v16h14V5h-2"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  clear: '<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M9 9l6 6M15 9l-6 6" stroke="var(--group)"/>',
}

export function icon(name, size = 22) {
  const holder = element('span')
  holder.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`
  return holder.firstChild
}

/** A round glass button that is only an icon, and so says what it does to a screen reader. */
export function roundButton(name, label, onClick) {
  const button = element('button', 'round glass', undefined, [icon(name)])
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.onclick = onClick
  return button
}

/**
 * A recipe's picture: its photo when it has one, its first letter on a colour of its own
 * when it does not. The colour comes from the name, so a recipe keeps it.
 */
export function picture(card, className, photo = null) {
  const box = element('span', `picture ${className}`)
  box.setAttribute('aria-hidden', 'true')
  if (photo) {
    const img = element('img')
    img.src = photo
    img.alt = ''
    img.loading = 'lazy'
    box.append(img)
    return box
  }
  box.textContent = (card?.title ?? '?').charAt(0).toLocaleUpperCase()
  box.style.background = COLOURS[hash(card?.title ?? '') % COLOURS.length]
  return box
}

const COLOURS = ['#8e3b26', '#3e4f3f', '#7a6528', '#a8742a', '#4a4136', '#5a2a24', '#3f5566', '#6b3f55']

function hash(text) {
  let sum = 0
  for (const char of text) sum = (sum * 31 + char.codePointAt(0)) >>> 0
  return sum
}

/** A sheet that slides up from the bottom, closed by its own buttons, Escape or the scrim. */
export function slide(...parts) {
  const box = element('dialog', 'slide')
  const body = element('div', '', undefined, [element('span', 'grabber'), ...parts])
  box.append(body)
  box.onclick = (event) => {
    if (event.target === box) box.close()
  }
  box.onclose = () => box.remove()
  document.body.append(box)
  box.showModal()
  return box
}

export function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children.filter(Boolean))
  return node
}
