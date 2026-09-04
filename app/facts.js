/**
 * What a recipe is, worked out from the recipe.
 *
 * How long it takes end to end and what it weighs are the two things a person wants
 * before starting, and neither is written anywhere on the card: the time is scattered
 * across the verbs of a dozen steps, and the weight is a sum nobody wants to do at the
 * counter. Everything here is arithmetic on what the card already says - nothing is
 * stored, nothing is asked for, and a recipe that has not been given the numbers simply
 * has no answer.
 */

const FRACTION = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }

/**
 * A duration, in a step's verb. Only the verb: a note holds asides like "rotate every
 * 20 min" and second opinions like "gesamt 70-80 min", and counting those either doubles
 * a step or invents work that is not a step at all. A range is taken at its upper bound,
 * so the total is the longest the recipe can take rather than a promise it may break.
 */
export const DURATION = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(min|h)\b/g

/**
 * A weight or a volume written as a fraction. `amount.js` reads `½ l` as words, because
 * its number pattern is digits only, so the amount arrives here as text; the format says
 * `½` is a number (`FORMAT.md` rule 3) and a total that quietly dropped half a litre of
 * water would be worse than no total at all.
 */
const WORDS = /^(\d*)\s*([½¼¾⅓⅔⅛])\s*(g|kg|ml|l)$/

const MASS = { g: 1, kg: 1000 }
const VOLUME = { ml: 1, l: 1000 }

export function facts(card) {
  const found = {
    minutes: 0,
    grams: 0,
    millilitres: 0,
    ingredients: 0,
    steps: 0,
  }

  for (const node of walk(card.root ? [card.root] : (card.strands ?? []))) {
    if (node.kind === 'ingredient') {
      found.ingredients += 1
      const { grams, millilitres } = measure(node.amount)
      found.grams += grams
      found.millilitres += millilitres
      continue
    }
    if (node.kind !== 'step') continue
    found.steps += 1
    for (const [, low, high, unit] of node.verb.matchAll(DURATION)) {
      const value = number(high ?? low)
      found.minutes += unit === 'h' ? value * 60 : value
    }
  }

  return found
}

function* walk(nodes) {
  for (const node of nodes) {
    yield node
    if (node.children) yield* walk(node.children)
  }
}

/** An amount in grams and millilitres. Anything counted in spoons or cubes is neither. */
function measure(amount) {
  const none = { grams: 0, millilitres: 0 }
  if (!amount) return none

  if (amount.kind === 'words') {
    const found = WORDS.exec(amount.text.trim())
    if (!found) return none
    const [, whole, part, unit] = found
    return scale((whole ? Number(whole) : 0) + FRACTION[part], unit)
  }

  const value = amount.kind === 'range' ? amount.to : amount.value
  return scale(value, amount.unit)
}

function scale(value, unit) {
  return {
    grams: value * (MASS[unit] ?? 0),
    millilitres: value * (VOLUME[unit] ?? 0),
  }
}

function number(text) {
  return Number(String(text).replace(',', '.'))
}

export function duration(minutes) {
  if (!minutes) return null
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  if (!hours) return `${rest} min`
  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

/**
 * Always grams. A dough is weighed in grams however heavy it gets, and a total given in
 * kilograms would have to be converted back before it was any use.
 */
export function mass(grams) {
  return grams ? `${Math.round(grams)} g` : null
}

export function volume(millilitres) {
  if (!millilitres) return null
  return millilitres >= 1000
    ? `${Math.round(millilitres / 10) / 100} l`
    : `${Math.round(millilitres)} ml`
}
