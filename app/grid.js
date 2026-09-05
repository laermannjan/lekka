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
  const columns = Math.max(0, ...strands.map((strand) => span.get(strand).column))
  for (const strand of strands) place(strand, columns, span, cells)

  return {
    rows,
    cells,
    frees: findFrees(occupy(rows, cells, columns)),
    band: buildBand(preparations, cells),
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

function place(node, column, span, cells) {
  if (node.kind === 'ingredient') return
  const { row, rowSpan } = span.get(node)
  cells.push({ node, column, columnSpan: 1, row, rowSpan })
  for (const child of node.children)
    if (child.kind !== 'preparation') place(child, column - 1, span, cells)
}

/**
 * The band: every preparation on the card, over the column it comes before.
 *
 * A preparation is always something done before something else, and what it is done
 * before is a step. One belonging to the recipe is the same thing said about the first
 * step, so it goes over the ingredient block - column 0 here - which is what comes
 * before every column there is.
 *
 * The column is worked out here and never stored. That answers the objection this was
 * once dropped for: a column is `max(column(input)) + 1`, so inserting a step upstream
 * moves every column after it - and the preparation moves with its step, because the
 * step is what it is attached to and the column is only where that step is standing
 * today.
 *
 * They pack into as few rows as will hold them. Two preparations on the same step need
 * two rows; two on different steps share one.
 */
function buildBand(global, cells) {
  const wanted = [
    ...global.map((node) => ({ node, column: 0 })),
    ...cells.flatMap((cell) =>
      (cell.node.children ?? [])
        .filter((child) => child.kind === 'preparation')
        .map((node) => ({ node, column: cell.column })),
    ),
  ]

  const rows = []
  for (const entry of wanted) {
    let row = rows.find((held) => held.every((one) => one.column !== entry.column))
    if (!row) rows.push((row = []))
    row.push(entry)
  }
  return rows.map((row) => [...row].sort((a, b) => a.column - b.column))
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
