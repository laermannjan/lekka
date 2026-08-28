/** A card to the table that draws it. Columns are numbered from 1; column 0 is the ingredients. */
export function buildGrid(card) {
  if (!card.root) return { rows: [], cells: [], frees: [], band: [], columns: 0, root: null }
  // The walk needs the tree the table came from, which a card has and a forest does not.
  return { ...buildForest([card.root], card.preparations), root: card.root }
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

/**
 * What stands on the counter when a column runs, as bands of the table's own rows.
 *
 * A step that has already run stands for every row it consumed - once the dough is mixed
 * and risen, its flour and water are not things the cook handles any more, `reifen 12 h`
 * is - and an ingredient nothing has reached yet stands for its own row, however long it
 * waits. Walking the card is walking this, one column at a time, and because a band keeps
 * the rows of what it replaced, nothing moves up or down on the way.
 */
export function frontierAt(grid, column) {
  const placed = new Map(grid.cells.map((cell) => [cell.node, cell]))
  const rowOf = new Map(grid.rows.map((node, row) => [node, row]))
  const bands = []

  const walk = (node) => {
    if (node.kind === 'preparation') return
    if (node.kind === 'ingredient')
      return void bands.push({ node, row: rowOf.get(node), rowSpan: 1 })

    const cell = placed.get(node)
    if (cell.column < column) return void bands.push({ node, row: cell.row, rowSpan: cell.rowSpan })
    for (const child of node.children) walk(child)
  }

  if (grid.root) walk(grid.root)
  return bands
}

/** The columns a card has, earliest first. One stop of the walk each. */
export function timeline(grid) {
  return [...new Set(grid.cells.map((cell) => cell.column))].sort((one, other) => one - other)
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
