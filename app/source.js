const INDENT = '  '

/** Tab indents, shift-tab outdents, enter keeps the indentation. */
export function editable(area) {
  area.onkeydown = (event) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      return shift(area, event.shiftKey ? -1 : 1)
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      const line = area.value.slice(0, area.selectionStart).split('\n').at(-1)
      return replace(area, `\n${line.match(/^ */)[0]}`)
    }
  }
  return area
}

/** The line under the cursor and everything indented under it become one step's inputs. */
export function wrapInStep(area) {
  const lines = area.value.split('\n')
  const [first, last] = block(lines, area)
  const indents = lines
    .slice(first, last + 1)
    .filter(Boolean)
    .map(indent)
  const base = indents.length ? Math.min(...indents) : 0

  const wrapped = lines.slice(first, last + 1).map((line) => (line ? INDENT + line : line))
  const step = `${' '.repeat(base)}- `

  select(area, offset(lines, first), offset(lines, last) + lines[last].length)
  replace(area, [step, ...wrapped].join('\n'))
  area.selectionStart = area.selectionEnd = offset(area.value.split('\n'), first) + step.length
  area.focus()
}

function shift(area, direction) {
  const lines = area.value.split('\n')
  const [first, last] = selected(lines, area)
  const moved = lines
    .slice(first, last + 1)
    .map((line) =>
      direction > 0 ? INDENT + line : line.startsWith(INDENT) ? line.slice(INDENT.length) : line,
    )

  select(area, offset(lines, first), offset(lines, last) + lines[last].length)
  replace(area, moved.join('\n'))
  select(area, offset(area.value.split('\n'), first), area.selectionEnd)
}

/** With a selection, the lines it touches. Without one, the whole subtree under the cursor. */
function block(lines, area) {
  const [first, last] = selected(lines, area)
  if (last > first) return [first, last]

  let end = first
  for (let line = first + 1; line < lines.length; line++) {
    if (lines[line].trim() === '') continue
    if (indent(lines[line]) <= indent(lines[first])) break
    end = line
  }
  return [first, end]
}

function selected(lines, area) {
  return [lineAt(lines, area.selectionStart), lineAt(lines, Math.max(area.selectionEnd - 1, area.selectionStart))]
}

function lineAt(lines, position) {
  let seen = 0
  for (const [index, line] of lines.entries()) {
    seen += line.length + 1
    if (position < seen) return index
  }
  return lines.length - 1
}

function offset(lines, index) {
  return lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0)
}

function indent(line) {
  return line.match(/^ */)[0].length
}

function select(area, start, end) {
  area.setSelectionRange(start, end)
}

/** Through execCommand, so the browser's own undo still works. */
function replace(area, text) {
  if (!document.execCommand('insertText', false, text)) {
    const { selectionStart, selectionEnd, value } = area
    area.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd)
  }
}
