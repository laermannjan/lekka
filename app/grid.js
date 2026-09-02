/** A card to the table that draws it. Columns are numbered from 1; column 0 is the ingredients. */
export function buildGrid(card) {
  if (!card.root) return { rows: [], cells: [], frees: [], band: [], columns: 0 }
  return buildForest([card.root], card.preparations)
}

/**
 * Several strands in one table, for a card that is still being written.
 *
 * A finished card has one root and this is that case. Half-written it has several, and
 * they belong in one table rather than one each: they share the ingredient column, and
 * an ingredient nobody has used yet is not a separate idea needing a separate drawing -
 * it is a row with nothing to the right of it, which the layout already draws as free
 * area.
 *
 * Every root is placed on the same last column. Right alignment (`LAYOUT.md`) already
 * moves a short strand right until it sits in front of the merge; here the merge has
 * not been written yet, so the strands align to where it will be. The point of doing it
 * now is that writing it later then moves nothing.
 */
export function buildForest(strands, preparations = []) {
  const rows = []
  const span = new Map()
  for (const strand of strands) measure(strand, rows, span)

  const cells = []
  const attached = []
  const columns = Math.max(0, ...strands.map((strand) => span.get(strand).column))
  for (const strand of strands) place(strand, columns, span, cells, attached)

  return {
    rows,
    cells,
    frees: findFrees(occupy(rows, cells, columns)),
    band: buildBand(preparations, attached, columns),
    columns,
  }
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
    if (child.kind === 'preparation') continue
    measure(child, rows, span)
    column = Math.max(column, span.get(child).column)
  }
  span.set(node, { row, rowSpan: rows.length - row, column: column + 1 })
}

function place(node, column, span, cells, attached) {
  if (node.kind === 'ingredient') return
  const { row, rowSpan } = span.get(node)
  cells.push({ node, column, columnSpan: 1, row, rowSpan })
  for (const child of node.children)
    if (child.kind === 'preparation') attached.push({ node: child, column, columnSpan: 1 })
    else place(child, column - 1, span, cells, attached)
}

function buildBand(global, attached, columns) {
  const entries = [
    ...global.map((node) => ({ node, column: 0, columnSpan: columns + 1 })),
    ...attached.sort((a, b) => a.column - b.column),
  ]

  const band = []
  for (const entry of entries) {
    const row = band.find((row) => row.every((other) => !overlaps(other, entry)))
    if (row) row.push(entry)
    else band.push([entry])
  }
  return band
}

function overlaps(a, b) {
  return a.column < b.column + b.columnSpan && b.column < a.column + a.columnSpan
}

function occupy(rows, cells, columns) {
  const fields = rows.map(() => new Array(columns).fill(null))
  for (const cell of cells)
    for (let row = cell.row; row < cell.row + cell.rowSpan; row++)
      fields[row][cell.column - 1] = cell
  return fields
}

function findFrees(cells) {
  const columns = cells[0]?.length ?? 0
  const used = cells.map((row) => row.map(Boolean))
  const frees = []

  for (let row = 0; row < used.length; row++) {
    for (let column = 0; column < columns; column++) {
      if (used[row][column]) continue

      const columnSpan = runFrom(used[row], column)
      const into = cells[row][column + columnSpan] ?? null
      let rowSpan = 1
      while (
        row + rowSpan < used.length &&
        runFrom(used[row + rowSpan], column) === columnSpan &&
        (cells[row + rowSpan][column + columnSpan] ?? null) === into
      )
        rowSpan++

      frees.push({ row, column: column + 1, rowSpan, columnSpan, into })
      for (let r = row; r < row + rowSpan; r++)
        for (let c = column; c < column + columnSpan; c++) used[r][c] = true
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
