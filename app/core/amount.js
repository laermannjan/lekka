// Amounts: the part of an ingredient line after the colon.
// Either a number with a unit, a range with a unit, or plain words.

const FRACTIONS = {
  '½': 1 / 2,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
}

const GLYPHS = Object.keys(FRACTIONS).join('')
const NUMBER = `(?:\\d+(?:[.,]\\d+)?[${GLYPHS}]?|[${GLYPHS}])`
const DASH = '[-–—]'
const AMOUNT = new RegExp(`^(${NUMBER})(?:\\s*${DASH}\\s*(${NUMBER}))?(?:\\s+(.*))?$`)

const EPSILON = 1e-9

/** Text after the colon → an amount, or null if there was nothing. */
export function parseAmount(text) {
  const trimmed = text.trim()
  if (trimmed === '') return null

  const match = AMOUNT.exec(trimmed)
  if (!match) return { kind: 'words', text: trimmed }

  const [, from, to, unit = ''] = match
  return to === undefined
    ? { kind: 'number', value: toNumber(from), unit: unit.trim() }
    : { kind: 'range', from: toNumber(from), to: toNumber(to), unit: unit.trim() }
}

/** An amount → the text that would stand after the colon. */
export function formatAmount(amount) {
  if (!amount) return ''
  if (amount.kind === 'words') return amount.text
  const number =
    amount.kind === 'range'
      ? `${formatNumber(amount.from)}-${formatNumber(amount.to)}`
      : formatNumber(amount.value)
  return amount.unit ? `${number} ${amount.unit}` : number
}

/** Multiply an amount. Words do not scale. */
export function scaleAmount(amount, factor) {
  if (!amount || amount.kind === 'words') return amount
  if (amount.kind === 'range')
    return { ...amount, from: amount.from * factor, to: amount.to * factor }
  return { ...amount, value: amount.value * factor }
}

/** `2`, `2,5`, `½`, `1½` → a number. */
function toNumber(text) {
  const glyph = text.at(-1)
  const fraction = FRACTIONS[glyph] ?? 0
  const digits = fraction ? text.slice(0, -1).trim() : text
  return (digits === '' ? 0 : Number(digits.replace(',', '.'))) + fraction
}

/** A number → `2`, `½`, `1½`, `2,5`. Always re-readable by `toNumber`. */
export function formatNumber(value) {
  const whole = Math.floor(value)
  const rest = value - whole

  if (rest < EPSILON) return String(whole)
  for (const [glyph, fraction] of Object.entries(FRACTIONS))
    if (Math.abs(rest - fraction) < EPSILON) return (whole || '') + glyph

  return String(Math.round(value * 1000) / 1000).replace('.', ',')
}
