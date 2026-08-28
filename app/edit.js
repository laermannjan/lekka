import { splitAside, formatCard, parseCard } from './card.js'
import { parseAmount, formatAmount } from './amount.js'

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

/**
 * What may be fed into a step. Anything already an input has a parent and is therefore
 * not a strand, so it is not offered - the filter the editor needs is simply "the roots".
 *
 * Editing an existing step adds back its own inputs, which are otherwise invisible for
 * exactly that reason, and drops any strand the step lies inside, since feeding a step
 * the strand it belongs to would make a loop.
 */
export function candidates(draft, step = null) {
  const free = draft.strands.filter((strand) => !holds(strand, step))
  return step ? [...inputs(step), ...free] : free
}

/** A step's inputs: its children, minus the preparations, which bring nothing in. */
export function inputs(step) {
  return step.children.filter((child) => child.kind !== 'preparation')
}

/** Every ingredient somewhere under a node: what a strand has gathered so far. */
export function beneath(node) {
  if (node.kind === 'ingredient') return [node]
  return (node.children ?? []).flatMap(beneath)
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
 * What a set of chosen rows means, as nodes.
 *
 * A row is an ingredient, but what you point at when you point at a row is whatever is
 * currently holding it - the rightmost cell in that row, which by right alignment is the
 * root of its strand. So the rule is: take the **outermost node whose rows are all
 * chosen**. Choose every row under `verrühren` and you have said `verrühren`; choose two
 * of its three and you have said those two ingredients, which then have to come out of
 * it. Nothing else needs deciding, and both readings fall out of the same walk.
 */
export function claim(draft, chosen) {
  const wanted = new Set(chosen)
  const taken = []
  for (const strand of draft.strands) gather(strand, wanted, taken)
  return taken
}

function gather(node, wanted, taken) {
  const rows = beneath(node)
  if (rows.length > 0 && rows.every((row) => wanted.has(row))) return void taken.push(node)
  if (node.kind !== 'step') return
  for (const child of inputs(node)) gather(child, wanted, taken)
}

/**
 * What taking those nodes would disturb: each one that is currently an input somewhere,
 * and each step that taking them would leave with nothing going into it.
 *
 * Said before it happens, because it is the one move in the editor that changes
 * something the user did not point at.
 */
export function upheaval(draft, taken) {
  const moved = []
  const emptied = []
  for (const node of taken) {
    const from = parentOf(draft, node)
    if (!from) continue
    moved.push({ node, from })
    const left = inputs(from).filter((child) => !taken.includes(child))
    if (left.length === 0 && !emptied.includes(from)) emptied.push(from)
  }
  return { moved, emptied }
}

/** A new ingredient, waiting to be used. */
export function addIngredient(draft, fields) {
  const node = ingredient(fields)
  return { ...draft, strands: [...draft.strands, node] }
}

/**
 * A new step. Its inputs stop being where they were and become its children; the step
 * takes their place, at the position of the earliest of them, so the list keeps its order.
 *
 * An input taken out of another step leaves that step behind, and a step with nothing
 * going into it is not a thing the format has - `FORMAT.md` rule 5 - so it goes with it.
 * `upheaval` is what says so before the move is made.
 */
export function addStep(draft, fields) {
  const node = step(fields)
  const taken = fields.inputs ?? []
  let next = draft
  for (const input of taken) next = detach(next, input, taken)
  return { ...next, strands: replaceAll(next.strands, taken, node) }
}

/** Lifts one node out of wherever it sits, and clears up after it. */
function detach(draft, node, taken) {
  const from = parentOf(draft, node)
  if (!from) return draft
  from.children = from.children.filter((child) => child !== node)
  return inputs(from).length === 0 ? removeNode(draft, from, taken) : draft
}

/** The same fields on a node that already exists. Inputs move in and out of the roots. */
export function editIngredient(draft, node, fields) {
  Object.assign(node, ingredient(fields))
  return { ...draft }
}

export function editStep(draft, node, fields) {
  const wanted = fields.inputs ?? []
  const dropped = inputs(node).filter((child) => !wanted.includes(child))
  const taken = wanted.filter((child) => draft.strands.includes(child))

  Object.assign(node, step({ ...fields, inputs: wanted }))
  return {
    ...draft,
    // Dropped inputs become strands again, in place of the ones the step swallowed.
    strands: [...replaceAll(draft.strands, taken, null), ...dropped].filter(Boolean),
  }
}

/**
 * Deleting a step frees what it was holding rather than taking the strand with it: the
 * inputs go back to the roots, in its place. Deleting an ingredient deletes it.
 */
export function removeNode(draft, node, taken = []) {
  // What the step held goes back to the roots, minus anything already being moved.
  const freed = (node.kind === 'step' ? inputs(node) : []).filter((one) => !taken.includes(one))
  const parent = parentOf(draft, node)
  if (parent) {
    parent.children = parent.children.filter((child) => child !== node)
    const next = { ...draft, strands: [...draft.strands, ...freed] }
    return inputs(parent).length === 0 ? removeNode(next, parent, taken) : next
  }
  return {
    ...draft,
    strands: draft.strands.flatMap((strand) => (strand === node ? freed : [strand])),
  }
}

/** Replaces `taken` in the roots with one node, at the earliest place any of them held. */
function replaceAll(strands, taken, node) {
  const first = strands.findIndex((strand) => taken.includes(strand))
  const kept = strands.filter((strand) => !taken.includes(strand))
  if (!node) return kept
  const at = first === -1 ? kept.length : Math.min(first, kept.length)
  return [...kept.slice(0, at), node, ...kept.slice(at)]
}

function ingredient({ name, aside, amount, unit }) {
  const text = [amount, unit].map((part) => (part ?? '').trim()).filter(Boolean).join(' ')
  return {
    kind: 'ingredient',
    name: (name ?? '').trim(),
    aside: blank(aside),
    amount: parseAmount(text),
  }
}

function step({ verb, aside, preparations = [], inputs = [] }) {
  return {
    kind: 'step',
    verb: (verb ?? '').trim(),
    aside: blank(aside),
    children: [...preparations.map(preparation), ...inputs],
  }
}

function preparation(text) {
  const { text: body, aside } = splitAside(String(text))
  return { kind: 'preparation', text: body, aside }
}

function blank(text) {
  const trimmed = (text ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/** The preparations of a step, as the lines the editor shows them as. */
export function preparationLines(node) {
  return (node.children ?? [])
    .filter((child) => child.kind === 'preparation')
    .map((child) => (child.aside ? `${child.text} (${child.aside})` : child.text))
}

/** The fields of a node, ready to fill a form with. */
export function fieldsOf(node) {
  if (node.kind === 'ingredient') {
    const amount = node.amount
    return {
      name: node.name,
      aside: node.aside ?? '',
      amount: amount ? formatAmount({ ...amount, unit: '' }) : '',
      unit: amount?.unit ?? '',
    }
  }
  return {
    verb: node.verb,
    aside: node.aside ?? '',
    preparations: preparationLines(node),
    inputs: inputs(node),
  }
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
  if ((draft.title ?? '').trim() === '') faults.push({ kind: 'title', message: 'The card needs a title' })
  storable(null, faults, false, ['title', draft.title], ['yield', draft.yields])
  for (const prep of draft.preparations) walk(prep, faults)

  const loose = draft.strands.filter((strand) => strand.kind === 'ingredient')
  for (const node of loose)
    faults.push({ kind: 'unused', node, message: `${label(node)} goes into no step` })

  const ends = draft.strands.filter((strand) => strand.kind === 'step')
  if (draft.strands.length === 0) faults.push({ kind: 'empty', message: 'The card has no steps' })
  else if (ends.length > 1)
    faults.push({
      kind: 'unjoined',
      nodes: ends,
      message: `${ends.map(label).join(' and ')} never meet. Add a step that takes them all`,
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
      faults.push({ kind: 'unstorable', node, message: `Brackets cannot be part of a ${what}. Put it in the note instead` })
    // Only an ingredient line is split at a colon, and it is split at the *first* one,
    // before the bracket is looked for - so a colon in its note is as fatal as one in
    // its name. A step, a preparation and the title are never split, and may hold one.
    else if (splits && text.includes(':'))
      faults.push({ kind: 'unstorable', node, message: `A colon cannot be part of a ${what}. Put it in the amount instead` })
  }
}

function walk(node, faults) {
  if (node.kind === 'ingredient') {
    if (node.name.trim() === '') faults.push({ kind: 'name', node, message: 'An ingredient needs a name' })
    storable(node, faults, true, ['name', node.name], ['note', node.aside])
    return
  }
  if (node.kind === 'preparation') {
    if (node.text.trim() === '')
      faults.push({ kind: 'name', node, message: 'A preparation needs something to do' })
    storable(node, faults, false, ['preparation', node.text], ['note', node.aside])
    return
  }
  if (node.verb.trim() === '') faults.push({ kind: 'verb', node, message: 'A step needs a verb' })
  storable(node, faults, false, ['instruction', node.verb], ['note', node.aside])
  if (inputs(node).length === 0)
    faults.push({ kind: 'starved', node, message: `${label(node)} has nothing going into it` })
  for (const child of node.children) walk(child, faults)
}

/** A node in one line, for a message or a checkbox. */
export function label(node) {
  if (node.kind === 'step') return node.verb.trim() === '' ? 'A step with no verb' : node.verb
  if (node.kind === 'preparation') return node.text
  const amount = formatAmount(node.amount)
  const name = node.name.trim() === '' ? 'an ingredient with no name' : node.name
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
  const card = fromDraft(draft)
  const text = formatCard(card)
  return sameCard(parseCard(text), card) ? text : null
}
