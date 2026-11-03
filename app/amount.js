const NUMBER = String.raw`\d+(?:[.,]\d+)?`
const AMOUNT = new RegExp(
  String.raw`^(?<from>${NUMBER})(?:\s*-\s*(?<to>${NUMBER}))?(?:\s+(?<unit>.*))?$`,
)

/** Text after the colon. null when the line had no colon at all. */
export function parseAmount(text) {
  const trimmed = text.trim()
  if (trimmed === '') return null

  const match = AMOUNT.exec(trimmed)
  if (!match) return { kind: 'words', text: trimmed }

  const { from, to, unit = '' } = match.groups
  return to === undefined
    ? { kind: 'number', value: toNumber(from), unit: unit.trim() }
    : { kind: 'range', from: toNumber(from), to: toNumber(to), unit: unit.trim() }
}

export function formatAmount(amount) {
  if (!amount) return ''
  if (amount.kind === 'words') return amount.text
  const number =
    amount.kind === 'range'
      ? `${formatNumber(amount.from)}-${formatNumber(amount.to)}`
      : formatNumber(amount.value)
  return amount.unit ? `${number} ${amount.unit}` : number
}

/**
 * An amount as it is read rather than written: what is measured in spoons, cups or litres
 * shows its fractions - ½ TL, 1¼ l - since nobody fills 0,3 of a spoon, and so does a
 * count. Grams and millilitres stay as a scale shows them.
 */
export function showAmount(amount) {
  if (!amount || amount.kind === 'words' || !SPOONED.test(amount.unit)) return formatAmount(amount)
  const number = amount.kind === 'range' ? `${fraction(amount.from)}-${fraction(amount.to)}` : fraction(amount.value)
  return amount.unit ? `${number} ${amount.unit}` : number
}

const SPOONED = /^(?:|l|el|tl|tbsp|tsp|cups?|tassen?|stück)$/i
const FRACTIONS = [[0, ''], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']]

/** `1½`, `⅓`, `2`: the nearest fraction a spoon has, or the number itself when none is near. */
export function fraction(value) {
  const whole = Math.floor(value)
  const [part, sign] = FRACTIONS.reduce((best, one) => (Math.abs(value - whole - one[0]) < Math.abs(value - whole - best[0]) ? one : best))
  if (Math.abs(value - whole - part) > 0.04) return formatNumber(value)
  const count = whole + (part === 1 ? 1 : 0)
  return sign ? `${count || ''}${sign}` : String(count)
}

/**
 * Multiplies. Ranges scale from both ends, words never scale. What comes out is rounded
 * the way it is measured: 47 ml rather than 46,957, a spoon to what `fraction` can say,
 * and a count with no unit to halves, since a clove of garlic can be halved and not cut
 * into thirds of a third.
 */
export function scaleAmount(amount, factor) {
  if (!amount || amount.kind === 'words' || factor === 1) return amount
  const round = (value) =>
    !amount.unit ? Math.max(0.5, Math.round(value * 2) / 2) : SPOONED.test(amount.unit) ? Math.round(value * 100) / 100 : measured(value)
  if (amount.kind === 'range')
    return { ...amount, from: round(amount.from * factor), to: round(amount.to * factor) }
  return { ...amount, value: round(amount.value * factor) }
}

function measured(value) {
  if (value >= 10) return Math.round(value)
  if (value >= 0.1) return Math.round(value * 10) / 10
  return Math.round(value * 100) / 100
}

function toNumber(text) {
  return Number(text.replace(',', '.'))
}

export function formatNumber(value) {
  return String(Math.round(value * 1000) / 1000).replace('.', ',')
}
