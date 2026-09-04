/**
 * Just enough DOM to run the editor.
 *
 * `ARCHITECTURE.md` is right that a stub proves nothing about what is visible: a rule in
 * the stylesheet cannot be seen from here, and the app answers that question by building
 * no element it does not mean. What a stub does prove is that the code runs and wires
 * the right node to the right form - which sheet a tap opens, what the checkbox list is
 * allowed to offer, what text the save would write. That is the part with the rules in
 * it, and it is worth holding down without a browser.
 */

class Element {
  constructor(tag) {
    this.tag = tag
    this.children = []
    this.own = ''
    this.className = ''
    this.parent = null
    this.dataset = {}
    this.style = { setProperty: (name, value) => (this.style[name] = value) }
    this.classList = {
      add: (...names) => this.classList.set(names, true),
      remove: (...names) => this.classList.set(names, false),
      toggle: (name, on) => this.classList.set([name], on ?? !this.classList.contains(name)),
      contains: (name) => this.className.split(' ').includes(name),
      set: (names, on) => {
        const held = new Set(this.className.split(' ').filter(Boolean))
        for (const name of names) if (on) held.add(name)
        else held.delete(name)
        this.className = [...held].join(' ')
      },
    }
    /* The sheet listens for `cancel`, which is Escape and the backdrop. Neither exists
       here, so the listener is kept and never fired. */
    this.listeners = new Map()
  }

  addEventListener(kind, run) {
    this.listeners.set(kind, run)
  }

  removeEventListener(kind) {
    this.listeners.delete(kind)
  }

  get textContent() {
    return this.own + this.children.map((child) => child.textContent).join('')
  }

  set textContent(text) {
    this.own = String(text)
    this.children = []
  }

  append(...kids) {
    for (const kid of kids) {
      kid.parent = this
      this.children.push(kid)
    }
  }

  replaceChildren(...kids) {
    this.children = []
    this.append(...kids)
  }

  remove() {
    if (!this.parent) return
    this.parent.children = this.parent.children.filter((child) => child !== this)
    this.parent = null
  }

  /** Swapping one node for another in place, which is how a fault list is refreshed
      without the table under it being drawn again. */
  replaceWith(node) {
    if (!this.parent) return
    this.parent.children[this.parent.children.indexOf(this)] = node
    node.parent = this.parent
    this.parent = null
  }

  insertBefore(node, before) {
    const at = before ? this.children.indexOf(before) : -1
    node.parent = this
    if (at === -1) this.children.push(node)
    else this.children.splice(at, 0, node)
    return node
  }

  setAttribute(name, value) {
    this[name] = String(value)
  }

  focus() {}

  /** Only the shapes the app uses: a comma-separated list of tag names. */
  querySelector(selector) {
    const wanted = selector.split(',').map((part) => part.trim())
    return descendants(this).find((node) => wanted.includes(node.tag)) ?? null
  }

  select() {}

  /** A form reset returns fields to what they were built with, which is always empty. */
  reset() {
    for (const node of descendants(this)) {
      if (node.tag === 'input' || node.tag === 'textarea') node.value = ''
      if (node.type === 'checkbox') node.checked = false
    }
  }

  showModal() {
    this.open = true
  }

  close() {
    this.open = false
    this.onclose?.()
  }

  settle() {}
}

export function descendants(root) {
  return root.children.flatMap((child) => [child, ...descendants(child)])
}

/** Everything under `root`, the element itself included. */
export function all(root) {
  return [root, ...descendants(root)]
}

/** The one element that matches, or a thrown error naming what was looked for. */
export function one(root, match, what = 'element') {
  const found = all(root).filter(match)
  if (found.length !== 1) throw new Error(`${found.length} of ${what}, wanted 1`)
  return found[0]
}

/**
 * A tap, which in a browser runs the handler of whatever the click reaches on its way
 * up. The verb inside a step cell carries no handler of its own; the cell does.
 */
export function tap(node, event = {}) {
  for (let at = node; at; at = at.parent) if (at.onclick) return at.onclick(event)
  throw new Error(`nothing handles a tap on ${node.tag}.${node.className}`)
}

export const byText = (text) => (node) => node.textContent === text
export const byClass = (name) => (node) => node.classList.contains(name)

/** Installs the stub as the globals the app reads, and hands back the body. */
export function install() {
  const body = new Element('body')
  globalThis.document = {
    body,
    createElement: (tag) => new Element(tag),
  }
  globalThis.confirm = () => true
  return body
}
