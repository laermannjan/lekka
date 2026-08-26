// .lekka text → a card. See FORMAT.md.
//
// card        { title, yields, notes, preparations, root }
// step        { kind: 'step', verb, aside, children }
// ingredient  { kind: 'ingredient', name, aside, amount }
//
// A line with indented lines under it is a step, one without is an ingredient.

import { parseAmount } from './amount.js'

export class ParseError extends Error {
  constructor(message, line) {
    super(message)
    this.name = 'ParseError'
    this.line = line
  }
}

const INDENT = 2

export function parseCard(text) {
  const card = { title: null, yields: null, notes: [], preparations: [], root: null }
  const stack = [] // stack[level] = the raw node opened at that level
  let root = null

  for (const line of contentLines(text)) {
    const { number, indent, body } = line

    if (body[0] !== '-') {
      if (indent > 0) throw new ParseError('Only steps and ingredients are indented', number)
      readCardLine(card, body, number)
      continue
    }

    if (indent % INDENT !== 0) throw new ParseError('Indent by two spaces per level', number)
    const level = indent / INDENT
    if (level > stack.length) throw new ParseError('Indentation skips a level', number)

    const node = { text: body.slice(1).trim(), line: number, children: [] }
    if (level === 0) {
      if (root) throw new ParseError('A card has one outermost line', number)
      root = node
    } else {
      stack[level - 1].children.push(node)
    }
    stack[level] = node
    stack.length = level + 1
  }

  if (!card.title) throw new ParseError('A card needs a title', 1)
  card.root = root && toNode(root)
  return card
}

/** Non-blank lines, with their indent and number. */
function* contentLines(text) {
  for (const [index, content] of text.split('\n').entries()) {
    if (content.trim() === '') continue
    yield {
      number: index + 1,
      indent: content.length - content.trimStart().length,
      body: content.trim(),
    }
  }
}

function readCardLine(card, body, number) {
  const rest = body.slice(1).trim()
  switch (body[0]) {
    case '#': {
      if (card.title) throw new ParseError('A card has one title', number)
      const { text, aside } = splitAside(rest)
      card.title = text
      card.yields = aside
      return
    }
    case '>':
      return void card.notes.push(rest)
    case '*':
      return void card.preparations.push(splitAside(rest))
    default:
      throw new ParseError(`A line starts with #, >, * or -`, number)
  }
}

/** A raw node becomes a step if it has children, an ingredient if not. */
function toNode(raw) {
  if (raw.children.length > 0) {
    const { text, aside } = splitAside(raw.text)
    return { kind: 'step', verb: text, aside, children: raw.children.map(toNode) }
  }

  const colon = raw.text.indexOf(':')
  const head = colon === -1 ? raw.text : raw.text.slice(0, colon)
  const { text, aside } = splitAside(head)
  return {
    kind: 'ingredient',
    name: text,
    aside,
    amount: colon === -1 ? null : parseAmount(raw.text.slice(colon + 1)),
  }
}

/** `Mehl (Type 550)` → text `Mehl`, aside `Type 550`. */
function splitAside(text) {
  const match = /^(.*?)\s*\(([^()]*)\)$/.exec(text.trim())
  return match ? { text: match[1], aside: match[2] } : { text: text.trim(), aside: null }
}
