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
  return from === to ? clock(from) : `${clock(from)}-${clock(to)}`
}

/**
 * `15h15`, `45 min`, `2h`: as short as a duration goes and still never read as a time
 * of day, which `15:15` would be. The same in every language the screen speaks.
 */
export function clock(seconds) {
  const all = Math.round(seconds / 60)
  const [hours, minutes] = [Math.floor(all / 60), all % 60]
  if (hours === 0) return `${minutes} min`
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, '0')}`
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

/**
 * A step as it is read out: its sentence, or, where it has none, one made of its words,
 * its time and its aside. The parts are words (`text`), a `number`, a `time`, a `heat`,
 * or an ingredient the sentence names (`use`, with its `node`, and the `name` it is said
 * by - capitalised when it opens the sentence). How much goes in is not said in it:
 * everything a step takes is listed right under it, named or not.
 *
 * A brace naming none of the step's ingredients is read as the plain word.
 */
export function phrase(step) {
  const parts = []
  const sentence = step.node.sentence
  if (sentence) {
    const left = [...step.ingredients]
    for (const piece of sentence.split(/(\{[^{}]*\})/)) {
      if (piece === '') continue
      const name = /^\{(.*)\}$/.exec(piece)?.[1]
      const at = name === undefined ? -1 : left.findIndex((one) => one.name === name)
      if (at === -1) {
        parts.push(...marks(name ?? piece))
        continue
      }
      const [node] = left.splice(at, 1)
      parts.push({ kind: 'use', node, name: node.name })
    }
  } else {
    parts.push(...marks(step.title))
    if (step.timeShown) parts.push({ kind: 'text', text: ' ' }, { kind: 'time', text: step.time.text })
    if (step.aside) parts.push({ kind: 'text', text: ', ' }, ...marks(step.aside))
  }
  if (parts[0]?.kind === 'text') parts[0] = { ...parts[0], text: capital(parts[0].text) }
  if (parts[0]?.kind === 'use') parts[0] = { ...parts[0], name: capital(parts[0].name) }
  return parts
}

const MARK = /\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?(?:\s*(?:°\s*[CF]|min|h|s|cm|mm|kg|g|ml|l)(?!\p{L}))?/gu

/** Words with their numbers picked out, and a time or a heat said to be one. */
export function marks(text) {
  const parts = []
  let from = 0
  for (const found of text.matchAll(MARK)) {
    if (found.index > from) parts.push({ kind: 'text', text: text.slice(from, found.index) })
    const kind = found[0].includes('°') ? 'heat' : /(min|h|s)$/.test(found[0]) ? 'time' : 'number'
    parts.push({ kind, text: found[0] })
    from = found.index + found[0].length
  }
  if (from < text.length) parts.push({ kind: 'text', text: text.slice(from) })
  return parts
}

/**
 * Every ingredient once, in the order it is first needed: the uses of one thing - one
 * name, one aside - added up. Amounts in one unit make one total, a range where any of
 * them is one; in different units, or in words, they stand side by side. `steps` says
 * where it goes in, `nodes` which uses it gathers.
 */
export function gather(card) {
  const lines = []
  for (const step of stepsOf(card))
    for (const node of step.ingredients) {
      let line = lines.find((one) => one.name === node.name && one.aside === (node.aside ?? null))
      if (!line) lines.push((line = { name: node.name, aside: node.aside ?? null, amounts: [], steps: [], nodes: [] }))
      line.nodes.push(node)
      if (!line.steps.includes(step.n)) line.steps.push(step.n)
      if (node.amount) add(line.amounts, node.amount)
    }
  return lines
}

function add(amounts, amount) {
  if (amount.kind === 'words') {
    if (!amounts.some((one) => one.kind === 'words' && one.text === amount.text)) amounts.push(amount)
    return
  }
  const at = amounts.findIndex((one) => one.kind !== 'words' && one.unit === amount.unit)
  if (at === -1) return void amounts.push(amount)
  const low = (one) => (one.kind === 'range' ? one.from : one.value)
  const high = (one) => (one.kind === 'range' ? one.to : one.value)
  const [from, to] = [low(amounts[at]) + low(amount), high(amounts[at]) + high(amount)]
  amounts[at] = from === to ? { kind: 'number', value: from, unit: amount.unit } : { kind: 'range', from, to, unit: amount.unit }
}
