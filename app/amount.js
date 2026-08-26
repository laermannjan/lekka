const NUMBER = '\\d+(?:[.,]\\d+)?'
const DASH = '-'
const AMOUNT = new RegExp(`^(${NUMBER})(?:\\s*${DASH}\\s*(${NUMBER}))?(?:\\s+(.*))?$`)

/** Text after the colon. null when the line had no colon at all. */
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

export function formatAmount(amount) {
  if (!amount) return ''
  if (amount.kind === 'words') return amount.text
  const number =
    amount.kind === 'range'
      ? `${formatNumber(amount.from)}-${formatNumber(amount.to)}`
      : formatNumber(amount.value)
  return amount.unit ? `${number} ${amount.unit}` : number
}

/** Multiplies. Ranges scale from both ends, words never scale. */
export function scaleAmount(amount, factor) {
  if (!amount || amount.kind === 'words') return amount
  if (amount.kind === 'range')
    return { ...amount, from: amount.from * factor, to: amount.to * factor }
  return { ...amount, value: amount.value * factor }
}

function toNumber(text) {
  return Number(text.replace(',', '.'))
}

export function formatNumber(value) {
  return String(Math.round(value * 1000) / 1000).replace('.', ',')
}
