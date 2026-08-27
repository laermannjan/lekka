import { readFileSync } from 'node:fs'

import { parseCard } from '../app/card.js'
import { buildGrid } from '../app/grid.js'
import { formatAmount, scaleAmount } from '../app/amount.js'

const MIN = 8
const MAX = 30

function draw(card, grid, scale) {
  const { rows, cells, frees, band, columns } = grid
  const texts = rows.map((row) => ingredientText(row, scale))
  const widths = [
    clamp(Math.max(...texts.map((text) => text.length), 10)),
    ...Array.from({ length: columns }, (_, index) =>
      clamp(Math.max(MIN, ...cellTexts(cells, index + 1).map((text) => text.length))),
    ),
  ]

  const left = widths.reduce((all, width) => [...all, all.at(-1) + width + 1], [0])
  const width = left.at(-1) + 1
  const height = 2 * (band.length + 1 + rows.length) + 1
  const sheet = { width, height, left, widths, chars: blank(width, height), h: [], v: [] }

  band.forEach((entries, index) => {
    for (const entry of entries)
      box(sheet, entry.column, entry.columnSpan, index, 1, preparationText(entry.node), 'centre')
  })

  const head = band.length
  box(sheet, 0, 1, head, 1, 'ZUTAT', 'left')
  for (let column = 1; column <= columns; column++)
    box(sheet, column, 1, head, 1, String(column).padStart(2, '0'), 'left')

  texts.forEach((text, index) => box(sheet, 0, 1, head + 1 + index, 1, text, 'left'))
  for (const cell of cells)
    box(sheet, cell.column, 1, head + 1 + cell.row, cell.rowSpan, cellText(cell), 'centre')
  for (const free of frees)
    box(sheet, free.column, free.columnSpan, head + 1 + free.row, free.rowSpan, '', 'left')

  for (const free of frees.filter((free) => free.into))
    open(sheet, free.column + free.columnSpan - 1, head + 1 + free.row, free.rowSpan)

  return [title(card), '', paint(sheet)].join('\n')
}

function title(card) {
  const notes = card.notes.length ? `  ${card.notes.join(' · ')}` : ''
  return `${card.title}${card.yields ? ` (${card.yields})` : ''}${notes}`
}

function preparationText(node) {
  return node.aside ? `${node.text} (${node.aside})` : node.text
}

function ingredientText(node, scale) {
  const amount = formatAmount(scaleAmount(node.amount, scale))
  const name = node.aside ? `${node.name} (${node.aside})` : node.name
  return amount ? `${amount} ${name}` : name
}

function cellText(cell) {
  return cell.node.aside ? `${cell.node.verb} (${cell.node.aside})` : cell.node.verb
}

function cellTexts(cells, column) {
  return cells.filter((cell) => cell.column === column).map(cellText)
}

function clamp(width) {
  return Math.min(MAX, Math.max(MIN, width))
}

function blank(width, height) {
  return Array.from({ length: height }, () => new Array(width).fill(' '))
}

function open(sheet, column, row, rowSpan) {
  const x = sheet.left[column] + sheet.widths[column] + 1
  for (let y = 2 * row; y < 2 * (row + rowSpan); y++) sheet.v[y][x] = false
}

function box(sheet, column, columnSpan, row, rowSpan, text, align) {
  const x0 = sheet.left[column]
  const x1 = sheet.left[column + columnSpan - 1] + sheet.widths[column + columnSpan - 1] + 1
  const y0 = 2 * row
  const y1 = y0 + 2 * rowSpan

  for (let x = x0; x < x1; x++) (sheet.h[y0] ??= [])[x] = true
  for (let x = x0; x < x1; x++) (sheet.h[y1] ??= [])[x] = true
  for (let y = y0; y < y1; y++) (sheet.v[y] ??= [])[x0] = true
  for (let y = y0; y < y1; y++) (sheet.v[y] ??= [])[x1] = true

  const inner = x1 - x0 - 3
  const cut = text.slice(0, inner)
  const pad = align === 'centre' ? Math.floor((inner - cut.length) / 2) : 0
  const y = y0 + rowSpan
  for (let index = 0; index < cut.length; index++)
    sheet.chars[y][x0 + 2 + pad + index] = cut[index]
}

const JOINTS = {
  0b1010: '┘', 0b1001: '└', 0b0110: '┐', 0b0101: '┌',
  0b1100: '│', 0b0011: '─', 0b1000: '│', 0b0100: '│', 0b0010: '─', 0b0001: '─',
  0b1101: '├', 0b1110: '┤', 0b0111: '┬', 0b1011: '┴', 0b1111: '┼',
}

function paint({ width, height, chars, h, v }) {
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const key =
        (v[y - 1]?.[x] ? 8 : 0) | (v[y]?.[x] ? 4 : 0) | (h[y]?.[x - 1] ? 2 : 0) | (h[y]?.[x] ? 1 : 0)
      if (key) chars[y][x] = JOINTS[key]
    }
  return chars.map((line) => line.join('').trimEnd()).join('\n')
}

const card = parseCard(readFileSync(process.argv[2], 'utf8'))
const scale = Number(process.argv[3] ?? 1)
console.log(draw(card, buildGrid(card), scale))
