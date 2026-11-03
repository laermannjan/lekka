import { splitAside, formatCard, parseCard } from './card.js'
import { parseAmount, formatAmount } from './amount.js'
import { language, t } from './i18n.js'

/**
 * A card being written, as the forest it really is.
 *
 * A finished card is one tree: indented under a line means flows into that line, so a
 * step's inputs are exactly its children and nothing has two parents. Half-written, it
 * is a handful of separate strands - a few ingredients nobody has used yet, a step or
 * two that have not been joined. That is the only difference, so the editor keeps the
 * same nodes in a list of roots and the card is the case where that list holds one.
 *
 * Everything here is a pure function over `strands`, an array of nodes. Nodes are the
 * ones `parseCard` builds and `formatCard` writes; they are compared by identity, never
 * by an id, because the editor holds one draft and never re-parses it under itself.
 */

/** The card as it was read, opened for editing. */
export function toDraft(card) {
  return {
    title: card.title,
    yields: card.yields,
    notes: [...card.notes],
    preparations: card.preparations.map((prep) => ({ ...prep })),
    strands: card.root ? [card.root] : [],
  }
}

/** The draft as a card again. Only ever called on a draft that `validate` passed. */
export function fromDraft(draft) {
  return {
    title: draft.title,
    yields: draft.yields,
    notes: [...draft.notes],
    preparations: draft.preparations.map((prep) => ({ ...prep })),
    root: draft.strands[0] ?? null,
  }
}

/** A step's inputs: its children, minus the preparations, which bring nothing in. */
export function inputs(step) {
  return step.children.filter((child) => child.kind !== 'preparation')
}

/** Whether `node` is `root` or lies somewhere under it. */
export function holds(root, node) {
  if (!node) return false
  if (root === node) return true
  return (root.children ?? []).some((child) => holds(child, node))
}

/** The step a node is fed into, or null when it is a strand of its own. */
export function parentOf(draft, node) {
  for (const strand of draft.strands) {
    const found = search(strand, node)
    if (found) return found
  }
  return null
}

function search(root, node) {
  for (const child of root.children ?? []) {
    if (child === node) return root
    const found = search(child, node)
    if (found) return found
  }
  return null
}

/**
 * The steps in the order they are done, across every strand: what the editor lists, and
 * what it numbers. A step comes after everything that flows into it, as `stepsOf` reads
 * a card; a strand nobody has joined yet comes after the ones before it.
 */
export function stepsIn(draft) {
  const steps = []
  const visit = (node) => {
    for (const child of node.children) if (child.kind === 'step') visit(child)
    steps.push(node)
  }
  for (const strand of draft.strands) if (strand.kind === 'step') visit(strand)
  return steps
}

/** The ingredients that go into a step itself, not those of the steps before it. */
export function ingredientsOf(step) {
  return step.children.filter((child) => child.kind === 'ingredient')
}

/**
 * What a step may take from before: the steps it takes now, and the ends of every other
 * strand. A step inside its own strand is never offered, which would make a loop.
 */
export function sources(draft, step) {
  const taken = step ? step.children.filter((child) => child.kind === 'step') : []
  const free = draft.strands.filter((strand) => strand.kind === 'step' && !holds(strand, step))
  return [...taken, ...free]
}

/**
 * A new step, said in `fields`, that goes after `after`: it takes what `after` made, and
 * whatever took that takes the new step instead - the chain spliced where it was cut. With
 * nothing before it, it starts a strand of its own.
 */
export function insertAfter(draft, after, fields) {
  const from = fields.from ?? (after ? [after] : [])
  const node = { kind: 'step', verb: '', aside: null, children: [] }
  let next
  if (after && from.includes(after)) next = replace(draft, after, node)
  else {
    // Taking nothing from the step it was added under, it is a strand of its own, listed
    // after that one's until a later step takes both.
    const strands = [...draft.strands]
    const at = after ? strands.findIndex((strand) => holds(strand, after)) : -1
    strands.splice(at === -1 ? strands.length : at + 1, 0, node)
    next = { ...draft, strands }
  }
  return { draft: setStep(next, node, { ...fields, from }), node }
}

/**
 * A step written again from its fields: how it is said and called, its ingredients, and
 * the steps it takes. A step it no longer takes is a strand of its own again, until
 * another takes it; one it takes now was the end of a strand, and is no longer.
 *
 * What it keeps keeps its place among its children, so a card that is opened and closed
 * again is the card it was. A preparation under it, from a card written before they all
 * came first, stays where it is.
 */
export function setStep(draft, node, { sentence = '', verb = '', aside = '', ingredients = [], from = [] }) {
  const had = node.children
  const dropped = had.filter((child) => child.kind === 'step' && !from.includes(child))
  const kept = had.filter((child) => child.kind === 'preparation' || from.includes(child) || ingredients.includes(child))
  const added = [...from.filter((one) => !had.includes(one)), ...ingredients.filter((one) => !had.includes(one))]

  node.verb = verb.trim()
  node.aside = blank(aside)
  const said = braced(sentence.trim(), ingredients)
  if (said) node.sentence = said
  else delete node.sentence
  node.children = [...kept, ...added]

  const strands = draft.strands.filter((strand) => !from.includes(strand))
  const at = strands.findIndex((strand) => holds(strand, node))
  strands.splice(at === -1 ? strands.length : at, 0, ...dropped)
  return { ...draft, strands }
}

/**
 * Takes a step out. Its own ingredients go with it; what went into it from before goes
 * into the step after it instead, so nothing else comes apart.
 */
export function deleteStep(draft, node) {
  const before = node.children.filter((child) => child.kind === 'step')
  const parent = parentOf(draft, node)
  if (parent) {
    parent.children = parent.children.flatMap((child) => (child === node ? before : [child]))
    return { ...draft }
  }
  return { ...draft, strands: draft.strands.flatMap((strand) => (strand === node ? before : [strand])) }
}

/** The step a step can be joined with: the one right before it, when that goes straight into it. */
export function mergeable(draft, node) {
  const steps = stepsIn(draft)
  const before = steps[steps.indexOf(node) - 1]
  return before && node.children.includes(before) ? before : null
}

/**
 * Two steps as one: the one before goes into the merged step with everything it took, so
 * whatever took the second takes the merged one. The same ingredient in both, in one
 * unit, is one line of their sum.
 */
export function merge(draft, node, fields) {
  const before = mergeable(draft, node)
  if (!before) return draft
  node.children = node.children.flatMap((child) => (child === before ? before.children : [child]))
  const ingredients = []
  for (const child of ingredientsOf(node)) {
    const same = ingredients.find((one) => one.name === child.name && one.aside === child.aside && summable(one.amount, child.amount))
    if (same) same.amount = { ...same.amount, value: same.amount.value + child.amount.value }
    else ingredients.push(child)
  }
  return setStep(draft, node, { ...fields, ingredients, from: node.children.filter((child) => child.kind === 'step') })
}

function summable(one, other) {
  return one?.kind === 'number' && other?.kind === 'number' && one.unit === other.unit
}

/** What two steps would say as one, to be read over before they are joined. */
export function joined(before, node) {
  const said = (step) => unbraced(step.sentence ?? step.verb)
  return {
    sentence: `${said(before)}${t(', then ')}${said(node)}`,
    verb: `${before.verb}, ${node.verb}`,
    aside: [before.aside, node.aside].filter(Boolean).join(', '),
  }
}

/**
 * A step in two: what is moving goes into a new step right after it, which takes what the
 * step made - and whatever took that takes the new step.
 */
export function split(draft, node, { keep, next, moving }) {
  const staying = ingredientsOf(node).filter((one) => !moving.includes(one))
  const from = node.children.filter((child) => child.kind === 'step')
  const once = setStep(draft, node, { ...keep, ingredients: staying, from })
  return insertAfter(once, node, { ...next, ingredients: moving, from: [node] })
}

/** An ingredient taken from its step into another. */
export function moveIngredient(draft, ingredient, to) {
  const from = parentOf(draft, ingredient)
  if (from) from.children = from.children.filter((child) => child !== ingredient)
  to.children = [...to.children, ingredient]
  return { ...draft }
}

/** Puts `node` where `old` stood, in its step or among the strands. */
function replace(draft, old, node) {
  const parent = parentOf(draft, old)
  if (parent) {
    parent.children = parent.children.map((child) => (child === old ? node : child))
    return { ...draft }
  }
  return { ...draft, strands: draft.strands.map((strand) => (strand === old ? node : strand)) }
}

/** An ingredient from the two fields it is written in: how much, and what - a sort in brackets. */
export function ingredientOf({ amount = '', name = '' }) {
  const { text, aside } = splitAside(name.trim())
  return { kind: 'ingredient', name: text.trim(), aside: blank(aside ?? ''), amount: parseAmount(amount.trim()) }
}

/** And back: the two fields an ingredient is written in. */
export function rowOf(node) {
  return {
    amount: formatAmount(node.amount),
    name: node.aside ? `${node.name} (${node.aside})` : node.name,
  }
}

/** A sentence as it is typed: its braces out, so a name reads as the word it is. */
export function unbraced(sentence) {
  return (sentence ?? '').replace(/\{([^{}]*)\}/g, '$1')
}

/**
 * The names of `ingredients` that a typed sentence says, as whole words and whatever
 * their case, so they need never be braced by hand.
 */
export function named(text, ingredients) {
  return ingredients.filter((one) => find(text, one.name) !== -1)
}

/** And the sentence as it is stored: each name it says braced, once, longest first. */
export function braced(text, ingredients) {
  let said = text
  const names = [...new Set(ingredients.map((one) => one.name).filter(Boolean))].sort((a, b) => b.length - a.length)
  for (const name of names) {
    const at = find(said, name)
    if (at !== -1) said = `${said.slice(0, at)}{${name}}${said.slice(at + name.length)}`
  }
  return said
}

/** Where a name stands in a sentence as a word of its own, outside any braces; -1 if it does not. */
function find(text, name) {
  if (!name) return -1
  const word = new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'giu')
  for (const found of text.matchAll(word)) {
    const before = text.slice(0, found.index)
    if (before.lastIndexOf('{') <= before.lastIndexOf('}')) return found.index
  }
  return -1
}

/**
 * The short form of a step that has only been said: its verb, then what can be heated or
 * timed, so the table has a label and the timer a time. The verb stands last in German,
 * "ruhen lassen" included, and first in English. It is a guess, and a field to correct.
 */
export function shortOf(text) {
  const plain = unbraced(text)
  const words = plain.replace(/[.,;:!]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  const verb = language === 'de' ? (words.at(-1) === 'lassen' && words.length > 1 ? words.slice(-2).join(' ') : words.at(-1)) : words[0]
  const heat = /\d+(?:[.,]\d+)?\s*°\s*[CF]\b/.exec(plain)?.[0]
  const time = /\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?\s*(?:min|h)\b/.exec(plain)?.[0]
  return [verb.toLocaleLowerCase(), heat, time].filter(Boolean).join(' ')
}

function blank(text) {
  const trimmed = (text ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/**
 * What is wrong with the draft, worst first. Empty means it can be saved.
 *
 * The rules are the parser's, checked before the text exists so that they can be said
 * about a node on the screen instead of about a line number. The one rule that is not
 * the parser's is the reason it exists: every ingredient must end up in a step, and all
 * the strands must meet, or the card is two recipes sharing a title.
 */
export function validate(draft) {
  const faults = []
  if ((draft.title ?? '').trim() === '') faults.push({ kind: 'title', message: t('The recipe needs a name') })
  storable(null, faults, false, ['title', draft.title], ['yield', draft.yields])
  for (const prep of draft.preparations) walk(prep, faults)

  const loose = draft.strands.filter((strand) => strand.kind === 'ingredient')
  for (const node of loose)
    faults.push({ kind: 'unused', node, message: t('{label} goes into no step', { label: label(node) }) })

  const ends = draft.strands.filter((strand) => strand.kind === 'step')
  if (draft.strands.length === 0) faults.push({ kind: 'empty', message: t('The recipe has no steps') })
  else if (ends.length > 1)
    faults.push({
      kind: 'unjoined',
      nodes: ends,
      message: t('{labels} never meet. Add a step that takes them all', { labels: ends.map(label).join(t(' and ')) }),
    })

  for (const strand of draft.strands) walk(strand, faults)
  return faults
}

/**
 * A field that the file could not hold, said while it is being typed.
 *
 * Brackets are the aside and a colon is what an ingredient line splits at, so a field
 * carrying either is punctuation the card would read as structure: `Salz: grob` comes
 * back as salt, in an amount of "grob". The text would even be written and read back
 * unchanged, so no round trip catches it - only knowing what the punctuation means does.
 */
function storable(node, faults, splits, ...fields) {
  for (const [what, text] of fields) {
    if (text === null || text === undefined) continue
    if (/[()\n]/.test(text))
      faults.push({ kind: 'unstorable', node, message: t('Brackets cannot be part of a {what}. Put it in the note instead', { what: t(what) }) })
    // Only an ingredient line is split at a colon, and it is split at the *first* one,
    // before the bracket is looked for - so a colon in its note is as fatal as one in
    // its name. A step, a preparation and the title are never split, and may hold one.
    else if (splits && text.includes(':'))
      faults.push({ kind: 'unstorable', node, message: t('A colon cannot be part of a {what}. Put it in the amount instead', { what: t(what) }) })
  }
}

function walk(node, faults) {
  if (node.kind === 'ingredient') {
    if (node.name.trim() === '') faults.push({ kind: 'name', node, message: t('An ingredient needs a name') })
    storable(node, faults, true, ['name', node.name], ['note', node.aside])
    return
  }
  if (node.kind === 'preparation') {
    if (node.text.trim() === '')
      faults.push({ kind: 'name', node, message: t('A preparation needs something to do') })
    storable(node, faults, false, ['preparation', node.text], ['note', node.aside])
    return
  }
  if (node.verb.trim() === '') faults.push({ kind: 'verb', node, message: t('A step needs a verb') })
  storable(node, faults, false, ['instruction', node.verb], ['note', node.aside])
  if (inputs(node).length === 0)
    faults.push({ kind: 'starved', node, message: t('{label} has nothing going into it', { label: label(node) }) })
  for (const child of node.children) walk(child, faults)
}

/** A node in one line, for a message or a checkbox. */
export function label(node) {
  if (node.kind === 'step') return node.verb.trim() === '' ? t('A step with no verb') : node.verb
  if (node.kind === 'preparation') return node.text
  const amount = formatAmount(node.amount)
  const name = node.name.trim() === '' ? t('an ingredient with no name') : node.name
  return amount ? `${amount} ${name}` : name
}

/**
 * Whether two cards say the same thing. The last thing checked before a card is stored,
 * because storing it is writing text and reading text back, and this asks the only
 * question that matters about that: did it survive.
 */
export function sameCard(one, other) {
  return (
    one.title === other.title &&
    (one.yields ?? null) === (other.yields ?? null) &&
    alike(one.notes, other.notes) &&
    alike(one.preparations, other.preparations) &&
    alike(one.root, other.root)
  )
}

function alike(one, other) {
  if (Array.isArray(one) || Array.isArray(other))
    return (
      Array.isArray(one) && Array.isArray(other) && one.length === other.length &&
      one.every((item, index) => alike(item, other[index]))
    )
  if (one === null || other === null || typeof one !== 'object' || typeof other !== 'object')
    return (one ?? null) === (other ?? null)

  const keys = new Set([...Object.keys(one), ...Object.keys(other)])
  return [...keys].every((key) => alike(one[key], other[key]))
}

/** The card as text, if the text means the same. Null when it would not survive. */
export function storedForm(draft) {
  // `fromDraft` keeps one root, so comparing against it cannot notice the others going
  // missing: the comparison would be against the truncation itself.
  if (draft.strands.length !== 1) return null
  const card = fromDraft(draft)
  const text = formatCard(card)
  return sameCard(parseCard(text), card) ? text : null
}
