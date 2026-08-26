import { parseAmount, formatAmount } from './amount.js'

export class ParseError extends Error {
  constructor(message, line) {
    super(message)
    this.name = 'ParseError'
    this.line = line
  }
}

const INDENT = 2

/** .lekka text to a card. Throws ParseError on the first bad line. */
export function parseCard(text) {
  const card = { title: null, yields: null, notes: [], preparations: [], root: null }
  const stack = []
  let root = null

  for (const { number, indent, body } of contentLines(text)) {
    const marker = body[0]
    if (indent === 0 && marker !== '-') {
      parseHeadLine(card, marker, body.slice(1).trim(), number)
      continue
    }
    if (marker !== '-' && marker !== '*')
      throw new ParseError('Only steps, ingredients and preparations are indented', number)

    if (indent % INDENT !== 0) throw new ParseError('Indent by two spaces per level', number)
    const level = indent / INDENT
    if (level > stack.length) throw new ParseError('Indentation skips a level', number)

    const node = { marker, text: body.slice(1).trim(), line: number, children: [] }
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

function parseHeadLine(card, marker, rest, number) {
  switch (marker) {
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
      return void card.preparations.push({ kind: 'preparation', ...splitAside(rest) })
    default:
      throw new ParseError('A line starts with #, >, * or -', number)
  }
}

function toNode(raw) {
  if (raw.marker === '*') {
    if (raw.children.length > 0) throw new ParseError('A preparation has no inputs', raw.line)
    return { kind: 'preparation', ...splitAside(raw.text) }
  }

  if (raw.children.length > 0) {
    const { text, aside } = splitAside(raw.text)
    const children = raw.children.map(toNode)
    if (children.every((child) => child.kind === 'preparation'))
      throw new ParseError('A step needs an ingredient', raw.line)
    return { kind: 'step', verb: text, aside, children }
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

function splitAside(text) {
  const match = /^(.*?)\s*\(([^()]*)\)$/.exec(text.trim())
  return match ? { text: match[1], aside: match[2] } : { text: text.trim(), aside: null }
}

/** A card to canonical .lekka text. Inverse of parseCard. */
export function formatCard(card) {
  const lines = [withAside(`# ${card.title}`, card.yields)]
  for (const note of card.notes) lines.push(`> ${note}`)
  for (const prep of card.preparations) lines.push(withAside(`* ${prep.text}`, prep.aside))
  if (card.root) lines.push('', ...formatNode(card.root, 0))
  return lines.join('\n') + '\n'
}

function* formatNode(node, level) {
  const indent = '  '.repeat(level)
  if (node.kind === 'preparation') {
    yield withAside(`${indent}* ${node.text}`, node.aside)
    return
  }
  if (node.kind === 'step') {
    yield withAside(`${indent}- ${node.verb}`, node.aside)
    for (const child of node.children) yield* formatNode(child, level + 1)
    return
  }
  const amount = formatAmount(node.amount)
  yield withAside(`${indent}- ${node.name}`, node.aside) + (amount ? `: ${amount}` : '')
}

function withAside(text, aside) {
  return aside === null || aside === undefined ? text : `${text} (${aside})`
}
