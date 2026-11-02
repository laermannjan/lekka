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
 * Multiplies. Ranges scale from both ends, words never scale. What comes out is rounded
 * the way it is measured: 47 ml rather than 46,957, and a count with no unit to halves,
 * since a clove of garlic can be halved and not cut into thirds of a third.
 */
export function scaleAmount(amount, factor) {
  if (!amount || amount.kind === 'words' || factor === 1) return amount
  const round = (value) => (amount.unit ? measured(value) : Math.max(0.5, Math.round(value * 2) / 2))
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
