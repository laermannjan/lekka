// A card → .lekka text. The inverse of parse.js: parse(write(card)) is card.

import { formatAmount } from './amount.js'

export function writeCard(card) {
  const lines = [withAside(`# ${card.title}`, card.yields)]
  for (const note of card.notes) lines.push(`> ${note}`)
  for (const prep of card.preparations) lines.push(withAside(`* ${prep.text}`, prep.aside))
  if (card.root) lines.push('', ...writeNode(card.root, 0))
  return lines.join('\n') + '\n'
}

function* writeNode(node, level) {
  const indent = '  '.repeat(level)
  if (node.kind === 'step') {
    yield withAside(`${indent}- ${node.verb}`, node.aside)
    for (const child of node.children) yield* writeNode(child, level + 1)
    return
  }
  const amount = formatAmount(node.amount)
  yield withAside(`${indent}- ${node.name}`, node.aside) + (amount ? `: ${amount}` : '')
}

function withAside(text, aside) {
  return aside === null || aside === undefined ? text : `${text} (${aside})`
}
