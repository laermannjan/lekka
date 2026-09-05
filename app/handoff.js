import { svg } from './qr.js'

/**
 * A link, at the one moment it exists in a form anybody can copy.
 *
 * Only the hash of a token is ever stored, so this is not a thing that can be looked up
 * again - which is why it is shown whole, with a QR code beside it. The person it is for
 * is usually holding a phone, and the alternative is reading twenty-two characters of an
 * alphabet chosen so that none of them look alike out loud.
 */
export function linkOut(url, note) {
  const shown = element('input')
  shown.type = 'text'
  shown.readOnly = true
  shown.value = url

  const copy = element('button', 'quiet', 'Copy')
  copy.type = 'button'
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url)
      copy.textContent = 'Copied'
    } catch {
      // A clipboard the browser will not open is not a reason to lose the link.
      shown.select?.()
      copy.textContent = 'Press ⌘C'
    }
  }

  const code = element('div', 'code')
  try {
    code.innerHTML = svg(url)
  } catch {
    // Too long to draw is not a reason to withhold the link itself.
  }

  return element('div', 'list', undefined, [
    note ? element('div', 'row', note) : null,
    element('div', 'row wide', undefined, [shown, copy]),
    element('div', 'row wide', undefined, [code]),
  ])
}

function element(tag, className = '', text, children = []) {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  node.append(...children.filter(Boolean))
  return node
}
