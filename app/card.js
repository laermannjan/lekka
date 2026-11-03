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
    if (marker === '>') {
      // The step above, said as a sentence: one line, right under its step.
      const level = indent / INDENT
      const owner = stack.length === level ? stack[level - 1] : null
      if (!owner || owner.marker !== '-' || owner.children.length > 0 || owner.sentence !== undefined)
        throw new ParseError('A sentence stands right under its step', number)
      owner.sentence = body.slice(1).trim()
      if (owner.sentence === '') throw new ParseError('A sentence needs words', number)
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
    const { text, aside } = splitAside(raw.text)
    if (text === '') throw new ParseError('A preparation needs a text', raw.line)
    return { kind: 'preparation', text, aside }
  }

  if (raw.children.length > 0) {
    const { text, aside } = splitAside(raw.text)
    if (text === '') throw new ParseError('A step needs a verb', raw.line)
    const children = raw.children.map(toNode)
    if (children.every((child) => child.kind === 'preparation'))
      throw new ParseError('A step needs an ingredient', raw.line)
    return { kind: 'step', verb: text, aside, ...(raw.sentence ? { sentence: raw.sentence } : {}), children }
  }
  if (raw.sentence) throw new ParseError('A step needs an ingredient', raw.line)

  const colon = raw.text.indexOf(':')
  const head = colon === -1 ? raw.text : raw.text.slice(0, colon)
  const { text, aside } = splitAside(head)
  if (text === '') throw new ParseError('An ingredient needs a name', raw.line)
  return {
    kind: 'ingredient',
    name: text,
    aside,
    amount: colon === -1 ? null : parseAmount(raw.text.slice(colon + 1)),
  }
}

export function splitAside(text) {
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
    if (node.sentence) yield `${indent}  > ${node.sentence}`
    for (const child of node.children) yield* formatNode(child, level + 1)
    return
  }
  const amount = formatAmount(node.amount)
  yield withAside(`${indent}- ${node.name}`, node.aside) + (amount ? `: ${amount}` : '')
}

function withAside(text, aside) {
  return aside === null || aside === undefined ? text : `${text} (${aside})`
}

/**
 * A recipe as JSON (`recipe.schema.json`) to .lekka text. The JSON is the card itself: a
 * step is `{step, aside, children}`, an ingredient `{ingredient, aside, amount}`, a
 * preparation `{preparation, aside}`. Where it came from and what else it is called have
 * fields of their own, and become notes until the format has a line for them.
 *
 * What the schema asks and the text cannot hold is refused here: brackets, which the text
 * would read as an aside, and a colon in a name, which it would read as the amount. What
 * an assistant gets wrong only in form is forgiven, since nobody is there to be told: a
 * preparation written as just its words, a step that nothing goes into, which is a
 * preparation whatever it was called, and a brace around a word that is none of its
 * step's ingredients, which is that word. The rest is left to the text it becomes, which
 * is parsed like any other.
 */
export function formatJson(json) {
  if (!isObject(json)) throw new ParseError('A recipe is an object', 1)
  if (!isObject(json.root)) throw new ParseError('A recipe needs a root step', 1)
  const source = words(json.source)
  const aliases = list(json.aliases).map(words).filter(Boolean)
  return formatCard({
    title: plain(json.title, 'title'),
    yields: plain(json.yields, 'yields') || null,
    notes: [
      ...list(json.notes).map(words),
      ...(source ? [`source: ${source}`] : []),
      ...(aliases.length > 0 ? [`aliases: ${aliases.join(', ')}`] : []),
    ],
    preparations: list(json.preparations).map((entry) => {
      const node = nodeFromJson(entry, true)
      if (node.kind !== 'preparation') throw new ParseError('Only preparations come before everything', 1)
      return node
    }),
    root: nodeFromJson(json.root),
  })
}

/** `inside` is whether the node stands under a step or before them all, rather than last. */
function nodeFromJson(json, inside = false) {
  if (typeof json === 'string' && inside) return { kind: 'preparation', text: plain(json, 'preparation'), aside: null }
  if (!isObject(json)) throw new ParseError('A step, an ingredient or a preparation is an object', 1)
  const aside = plain(json.aside, 'aside') || null
  if ('step' in json) {
    const verb = plain(json.step, 'step')
    if (list(json.children).length === 0) {
      if (inside) return { kind: 'preparation', text: verb, aside }
      throw new ParseError(`A step needs an ingredient: ${verb}`, 1)
    }
    const children = list(json.children).map((child) => nodeFromJson(child, true))
    const takes = children.filter((child) => child.kind === 'ingredient').map((child) => child.name)
    const sentence = words(json.sentence).replace(/\{([^{}]*)\}/g, (brace, name) => (takes.includes(name) ? brace : name))
    return { kind: 'step', verb, aside, ...(sentence ? { sentence } : {}), children }
  }
  if ('ingredient' in json) {
    const name = plain(json.ingredient, 'ingredient')
    if (name.includes(':')) throw new ParseError(`An ingredient's name holds no colon: ${name}`, 1)
    // An assistant asked for `"250 g"` will sometimes split it anyway.
    const amount = [json.amount, json.unit].map(words).filter(Boolean).join(' ')
    return { kind: 'ingredient', name, aside, amount: parseAmount(amount) }
  }
  if ('preparation' in json) return { kind: 'preparation', text: plain(json.preparation, 'preparation'), aside }
  throw new ParseError('Each entry is a step, an ingredient or a preparation', 1)
}

/** One line of text, whatever arrived: a line break inside a value would start a new one. */
function words(value) {
  return value === null || value === undefined ? '' : String(value).replace(/\s+/g, ' ').trim()
}

/** Words that will stand where the text reads brackets as an aside. */
function plain(value, what) {
  const text = words(value)
  if (/[()]/.test(text)) throw new ParseError(`The ${what} holds no brackets: ${text}`, 1)
  return text
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
