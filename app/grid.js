/** A card to the table that draws it. Columns are numbered from 1; column 0 is the ingredients. */
export function buildGrid(card) {
  const rows = []
  if (!card.root) return { rows, cells: [], frees: [], columns: 0 }

  const span = new Map()
  measure(card.root, rows, span)

  const cells = []
  const columns = span.get(card.root).column
  place(card.root, columns, span, cells)

  return { rows, cells, frees: findFrees(occupy(rows, cells, columns)), columns }
}

function measure(node, rows, span) {
  const row = rows.length
  if (node.kind === 'ingredient') {
    rows.push(node)
    span.set(node, { row, rowSpan: 1, column: 0 })
    return
  }

  let column = 0
  for (const child of node.children) {
    measure(child, rows, span)
    column = Math.max(column, span.get(child).column)
  }
  span.set(node, { row, rowSpan: rows.length - row, column: column + 1 })
}

function place(node, column, span, cells) {
  if (node.kind === 'ingredient') return
  cells.push({ node, column, ...span.get(node), columnSpan: 1 })
  for (const child of node.children) place(child, column - 1, span, cells)
}

function occupy(rows, cells, columns) {
  const fields = rows.map(() => new Array(columns).fill(null))
  for (const cell of cells)
    for (let row = cell.row; row < cell.row + cell.rowSpan; row++)
      fields[row][cell.column - 1] = cell
  return fields
}

function findFrees(fields) {
  const columns = fields[0]?.length ?? 0
  const frees = []

  for (let row = 0; row < fields.length; row++) {
    for (let column = 0; column < columns; column++) {
      if (fields[row][column]) continue

      const columnSpan = runFrom(fields[row], column)
      let rowSpan = 1
      while (
        row + rowSpan < fields.length &&
        runFrom(fields[row + rowSpan], column) === columnSpan
      )
        rowSpan++

      const free = { row, column: column + 1, rowSpan, columnSpan }
      free.openRight = opensRight(fields, free)
      frees.push(free)

      for (let r = row; r < row + rowSpan; r++)
        for (let c = column; c < column + columnSpan; c++) fields[r][c] = free
      column += columnSpan - 1
    }
  }
  return frees
}

function runFrom(row, column) {
  let width = 0
  while (column + width < row.length && !row[column + width]) width++
  return width
}

function opensRight(fields, { row, column, rowSpan, columnSpan }) {
  const right = column - 1 + columnSpan
  if (right >= fields[row].length) return false
  const neighbour = fields[row][right]
  if (!neighbour) return false
  for (let r = row; r < row + rowSpan; r++) if (fields[r][right] !== neighbour) return false
  return true
}
