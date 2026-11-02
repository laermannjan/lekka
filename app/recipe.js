/**
 * A card read as a cook reads it: steps in the order they are done, each with what goes
 * into it, and what the recipe says about itself in its notes.
 *
 * The card is a tree, last step outermost. Read in order, a step comes after everything
 * that flows into it, and a preparation comes right before the step that needs it - the
 * tin is greased when the dough is ready for it, not before the flour is weighed. One
 * standing at the outermost level comes before everything, as the format says.
 */
export function stepsOf(card) {
  const steps = []
  const visit = (node) => {
    const children = node.children ?? []
    for (const child of children) if (child.kind === 'step') visit(child)
    for (const child of children) if (child.kind === 'preparation') steps.push(entry(child, []))
    steps.push(entry(node, children.filter((child) => child.kind === 'ingredient')))
  }
  for (const preparation of card.preparations) steps.push(entry(preparation, []))
  if (card.root) visit(card.root)
  return steps.map((step, index) => ({ ...step, n: index + 1 }))
}

const TEMPERATURE = /\d+(?:[.,]\d+)?\s*°\s*[CF]\b/
const DURATION = /(\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?\s*(min|h)\b/
const SECONDS = { min: 60, h: 3600 }

/**
 * One step as it is shown. A time that ends the words is taken out of them and shown on
 * its own, where it can become a timer: `backen 150 °C 3 h` is `Backen 150 °C`, for 3 h.
 * One inside them stays, since `braten 2 min je Seite` without it says nothing. The
 * temperature is kept in the words either way - it is part of what the step is called.
 */
function entry(node, ingredients) {
  const text = node.kind === 'step' ? node.verb : node.text
  const time = DURATION.exec(text)
  const last = time && text.trimEnd().endsWith(time[0])
  const words = (last ? text.slice(0, time.index) : text).replace(/\s+/g, ' ').trim()
  return {
    kind: node.kind,
    node,
    title: capital(words),
    aside: node.aside,
    temperature: TEMPERATURE.exec(text)?.[0].replace(/\s*°\s*/, ' °') ?? null,
    time: time ? duration(time) : null,
    timeShown: Boolean(last),
    ingredients,
  }
}

function duration([text, from, to, unit]) {
  const seconds = (value) => Math.round(Number(value.replace(',', '.')) * SECONDS[unit])
  return { text: text.replace(/\s+/g, ' '), from: seconds(from), to: seconds(to ?? from) }
}

/** The steps' times added up, from and to: a range anywhere makes the whole a range. */
export function totalTime(steps) {
  const timed = steps.filter((step) => step.time)
  if (timed.length === 0) return null
  const from = timed.reduce((sum, step) => sum + step.time.from, 0)
  const to = timed.reduce((sum, step) => sum + step.time.to, 0)
  return from === to ? clock(from) : `${clock(from)} to ${clock(to)}`
}

/** `15 h 15 min`, `45 min`, `2 h`. */
export function clock(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`
}

/** `10 Portionen` is ten of something, which is what a stepper counts. Words are nothing. */
export function servings(yields) {
  const match = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(yields ?? '')
  if (!match) return null
  return { count: Number(match[1].replace(',', '.')), unit: match[2] }
}

/**
 * What a recipe says about itself in its notes. Where it came from and what else it is
 * called are notes with a name in front, written by whoever converted it; the rest are
 * the recipe's own.
 */
export function aboutOf(card) {
  const about = { source: null, aliases: [], notes: [] }
  for (const note of card.notes) {
    const named = /^(source|aliases):\s*(.*)$/.exec(note)
    if (named?.[1] === 'source') about.source = named[2]
    else if (named?.[1] === 'aliases')
      about.aliases.push(...named[2].split(',').map((alias) => alias.trim()).filter(Boolean))
    else about.notes.push(note)
  }
  return about
}

/** `tasty.co` for `https://tasty.co/recipe/…`, or the text itself when it is no address. */
export function sourceName(source) {
  try {
    return new URL(source).hostname.replace(/^www\./, '')
  } catch {
    return source
  }
}

function capital(text) {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1)
}
