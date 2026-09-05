/**
 * The app driven in a real browser, for the behaviour a stub DOM cannot answer for.
 *
 * `test/dom.js` is enough for what the app *builds*, which is most of it. It is not
 * enough for what a browser does around that: `change` fires as the caret leaves a
 * field, so whether a commit throws the caret out of the row it is in cannot be asked
 * of a stub that has no caret at all. Neither can whether a repaint takes the focus off
 * the box that caused it, nor what `zoom` does to a length a band is centred in.
 *
 * Every one of those was a real bug, and every one of them was green in `node --test`.
 *
 *   node tools/check.mjs
 *
 * Needs Chrome. Set CHROME to point at another one. Exits non-zero on a failure.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { openStore } from '../server/store.js'
import { handler } from '../server/http.js'

const CHROMES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const CARD = `# Pfannkuchen (12 Stück)
* Pfanne vorheizen

- braten 2 min je Seite
  - verrühren
    - Mehl (Type 550): 250 g
    - Milch: 500 ml
    - Eier: 2
  - schmelzen
    - Butter: 30 g
`

/*
 * A card whose rows wait. `Zucker` goes straight into `vermengen`, which stands in
 * column 02, so it waits through column 01 - and that blank is the rest of `vermengen`'s
 * L. Opening `servieren` makes `vermengen` a thing coming in, which is the one state
 * where the whole L has to take the colour at once.
 */
const WAITING = `# Waiting

- servieren
  - vermengen
    - kneten
      - Mehl: 250 g
    - Zucker: 2 EL
`

/* A card too wide for the window, which is where reading and writing used to part
   company: the reading view capped its ingredient names at 200px and wrapped them. */
const LONG = await readFile(new URL('../test/cards/roggenquarkbrot.lekka', import.meta.url), 'utf8')

/**
 * The checks, as the page runs them. Each one says what it is asking in the words the
 * code uses, so a failure reads as a sentence about the app rather than a line number.
 */
const CHECKS = `
import { parseCard } from './card.js'
import { renderCard } from './render.js'
import { renderReading } from './read.js'
import { buildEditor } from './editor.js'
import { toDraft, addIngredient } from './edit.js'

const TEXT = ${JSON.stringify(CARD)}
const WAITING = ${JSON.stringify(WAITING)}
const LONG = ${JSON.stringify(LONG)}
const said = []
const check = (name, ok, detail = '') =>
  said.push(\`\${ok ? 'PASS' : 'FAIL'} \${name}\${detail ? \` :: \${detail}\` : ''}\`)

// A loose ingredient, so an open step has something offered that it does not yet take.
const editor = buildEditor({
  draft: addIngredient(toDraft(parseCard(TEXT)), { name: 'Zucker', amount: '2', unit: 'EL' }),
  onSave: async () => null,
  onClose: () => {},
})
document.getElementById('screen').append(editor)

const rows = () => [...editor.querySelectorAll('.grid > .hold')]
const cells = () => [...editor.querySelectorAll('.grid .holds > .step')]
const cellFor = (verb) => cells().find((cell) => cell.textContent.startsWith(verb))
const form = () => document.querySelector('dialog.compose[open]')
const boxes = () => [...form().querySelectorAll('.choice input')]
const shadedRows = () => editor.querySelectorAll('.grid > .hold.chosen').length
const button = (text) =>
  [...form().querySelectorAll('button')].find((one) => one.textContent === text)
const specRow = (name) => {
  const kids = [...editor.querySelector('.spec').children]
  const at = kids.findIndex((node) => node.classList.contains('label') && node.textContent === name)
  return at === -1 ? null : kids[at + 1].textContent
}

/*
 * The measurement this whole arrangement exists for: what the table looks like before a
 * cell is touched, and after. Every track, to the pixel.
 */
const grid = () => editor.querySelector('.grid')
const tracks = () => getComputedStyle(grid()).gridTemplateColumns
const lines = () => getComputedStyle(grid()).gridTemplateRows
const before = { columns: tracks(), rows: lines() }

// A tap on a row opens the form on it. Nothing in the table becomes a field.
rows()[0].click()
check('a tap on a row opens the form', Boolean(form()))
check('and the table does not become a form',
  editor.querySelectorAll('.grid input, .grid textarea').length === 0,
  String(editor.querySelectorAll('.grid input, .grid textarea').length))
check('the columns have not moved', tracks() === before.columns)
check('nor the rows', lines() === before.rows)

const amount = form().querySelector('input.amount')
check('the caret is in the first field', document.activeElement === amount,
  document.activeElement?.className)

// Typing moves nothing. \`Apply\` is the only thing that writes.
amount.value = '300'
amount.dispatchEvent(new Event('change'))
check('typing writes nothing on its own', specRow('Weight') === '280 g', String(specRow('Weight')))
check('and moves no column', tracks() === before.columns)

button('Apply').click()
check('Apply writes it', specRow('Weight') === '330 g', String(specRow('Weight')))
check('and closes the form', form() === null)
check('and the table still has the columns it had', tracks() === before.columns)

// A step: its inputs come up ticked, and what they bring is shaded in the table behind.
cellFor('schmelzen').click()
check('opening a step offers boxes', boxes().length === 2, String(boxes().length))
check('ticked where it already takes it', boxes().filter((box) => box.checked).length === 1)
check('and the whole of what it takes is shaded', shadedRows() === 1, String(shadedRows()))
check('and the step it is open on is ringed',
  editor.querySelectorAll('.grid .holds > .step.here').length === 1)

const spare = boxes().find((box) => !box.checked)
spare.click()
check('ticking one shades what it brings with it', shadedRows() === 2, String(shadedRows()))
check('and still moves no column', tracks() === before.columns)

/*
 * Chosen has to beat lit. \`:hover\` was the more specific selector, so a shaded thing
 * turned grey when the pointer crossed it - and grey is what something *not* coming in
 * looks like, so a sweep of the pointer read as unchoosing.
 */
const AMBER = 'rgb(251, 238, 181)'
const painted = (node) => getComputedStyle(node).backgroundColor
const shadedRow = editor.querySelector('.grid > .hold.chosen')
check('a chosen row is amber over its cells', painted(shadedRow.firstElementChild) === AMBER,
  painted(shadedRow.firstElementChild))

const rule = (wanted) =>
  [...document.styleSheets]
    .flatMap((one) => [...one.cssRules])
    .some((one) => one.selectorText?.split(',').some((part) => part.trim() === wanted))
check('and stays amber under the pointer', rule('.step.chosen.lit') && rule('.free.chosen.lit'))
button('Close').click()
check('closing takes the shading away', shadedRows() === 0, String(shadedRows()))

/*
 * A row that waits. Its fields stop at the ingredient block; the row itself reaches as
 * far as the step that takes it, and free area is drawn over the part in between to
 * carry the rules. Two things have to be true of that overlap: the row is painted under
 * it, and a tap in it reaches the row rather than stopping on the rectangle.
 */
const second = buildEditor({ draft: toDraft(parseCard(WAITING)), onSave: async () => null, onClose: () => {} })
document.getElementById('screen').append(second)

const outermost = [...second.querySelectorAll('.grid .holds > .step')].find((one) => one.textContent.startsWith('servieren'))
outermost.click()

const waiting = [...second.querySelectorAll('.grid > .hold')].find((one) => one.textContent.includes('Zucker'))
const inked = [...waiting.children].at(-1).getBoundingClientRect()
const wide = waiting.getBoundingClientRect()
check('a waiting row is wider than its own fields', wide.right - inked.right > 40,
  \`row to \${wide.right.toFixed(0)}, fields to \${inked.right.toFixed(0)}\`)

/*
 * The L. A step's region is its own cell plus every rectangle of blank flowing into it -
 * the cell standing at the right of the rows it takes, and the space those rows wait in
 * reaching back under them. Shaded, both halves take the colour or the corner is missing.
 */
const shadedStep = second.querySelector('.grid .holds > .step.chosen')
const shadedFree = second.querySelector('.grid > .free.chosen')
check('a chosen step is amber', painted(shadedStep) === AMBER, painted(shadedStep))
check('and so is the blank flowing into it, which is the rest of its L',
  Boolean(shadedFree) && painted(shadedFree) === AMBER, shadedFree ? painted(shadedFree) : 'no blank shaded')

document.querySelector('dialog.compose[open]')?.close()

/*
 * What a tap in the blank means. The rectangle is two true things at once - the row is
 * waiting in it, and the step it is waiting for encloses it - and the enclosing step is
 * the one you are aiming at: it is the block your eye reads it as part of.
 */
const middle = [(inked.right + wide.right) / 2, (wide.top + wide.bottom) / 2]
const blank = document.elementFromPoint(...middle)
check('the blank a row waits in is the free area, not the row',
  blank?.classList.contains('free'), blank?.className)

blank.click()
const held = second.querySelector('dialog.compose[open]')
const kind = held?.querySelector('.kind')?.textContent
check('and a tap on it opens the step it is waiting for, not the row',
  document.querySelector('dialog.compose[open] .kind')?.textContent === 'Step',
  document.querySelector('dialog.compose[open] .kind')?.textContent)
document.querySelector('dialog.compose[open]')?.close()

/*
 * A row is still pointed at by its own cells. Found again first: opening the form
 * repainted the table, so every node measured above is detached now.
 */
const again = [...second.querySelectorAll('.grid > .hold')].find((one) => one.textContent.includes('Zucker'))
const cell = [...again.children].at(-1).getBoundingClientRect()
const onCell = document.elementFromPoint((cell.left + cell.right) / 2, (cell.top + cell.bottom) / 2)
check('a row is pointed at by its own cells', again.contains(onCell), onCell?.className)

/*
 * Density. A row is a line of a recipe, and a line should say itself in a line: the
 * ingredient names were held to 200px while a card was being read, so a qualifier
 * broke onto its own line and half the table was air. Both views size their columns
 * by the same rule now, so a recipe is the same shape either way.
 */
const tall = document.createElement('div')
document.getElementById('screen').append(tall)
tall.append(renderReading(parseCard(LONG), 1, 0, { onAt: () => {}, onFits: () => {} }))
const written = buildEditor({ draft: toDraft(parseCard(LONG)), onSave: async () => null, onClose: () => {} })
document.getElementById('screen').append(written)

/*
 * A preparation stands over the column of the step it comes before, above the head of
 * the table. Both halves of that are measured: which column it is over, and that it is
 * above the line that names the columns rather than below it.
 */
const narrow = document.createElement('div')
document.getElementById('screen').append(narrow)
narrow.append(renderReading(parseCard(TEXT), 1, 0, { onAt: () => {}, onFits: () => {} }))

requestAnimationFrame(() => {
  const linesOf = (root) => {
    const heights = [...root.querySelectorAll('.grid > .hold')].map((one) =>
      one.getBoundingClientRect().height)
    return { least: Math.min(...heights), most: Math.max(...heights) }
  }
  for (const [name, root] of [['read', tall], ['written', written]]) {
    const { least, most } = linesOf(root)
    check(\`every row says itself in one line, \${name}\`, most < least * 1.4,
      \`\${least.toFixed(1)} to \${most.toFixed(1)}\`)
  }
  const columns = (root) => getComputedStyle(root.querySelector('.grid')).gridTemplateColumns
  check('and the two views size their columns alike',
    columns(tall).split(' ').slice(3, -1).join(' ') === columns(written).split(' ').slice(3, -1).join(' '),
    columns(tall) + '  vs  ' + columns(written))

  /*
   * Scaling a card must not cost it a line. The amount track was 58px whatever stood in
   * it, so a doubled range did not fit and wrapped, and the row it was on
   * grew by a whole second line - at the size a cook is most likely to be reading it.
   */
  for (const factor of [1, 1.5, 2]) {
    const at = document.createElement('div')
    document.getElementById('screen').append(at)
    at.append(renderCard(parseCard(LONG), factor))
    const { least, most } = linesOf(at)
    check(\`no row gains a line at \${factor} times\`, most < least * 1.4,
      \`\${least.toFixed(1)} to \${most.toFixed(1)}\`)

    /*
     * And it fits rather than merely refusing to wrap. Not wrapping in a track too
     * narrow for the number spills the text over its neighbour instead of over a second
     * line, which is not better - and a scroll width does not report it, because a cell
     * that overflows visibly has nothing to scroll. So the text is measured itself.
     */
    const spills = (one) => {
      const range = document.createRange()
      range.selectNodeContents(one)
      const text = range.getBoundingClientRect()
      const cell = one.getBoundingClientRect()
      const style = getComputedStyle(one)
      return (
        text.left < cell.left + Number.parseFloat(style.paddingLeft) - 1 ||
        text.right > cell.right - Number.parseFloat(style.paddingRight) + 1
      )
    }
    const over = [...at.querySelectorAll('.amount, .unit, .words')]
      .filter((one) => one.textContent && spills(one))
      .map((one) => one.className + ' "' + one.textContent + '"')
    check(\`and every amount fits its own cell at \${factor} times\`, over.length === 0, over.join(', '))
  }

  const table = narrow.querySelector('.grid')
  const prep = table.querySelector('.preparation')
  const heading = table.querySelector('.label.heading')
  const first = [...table.querySelectorAll('.label')].find((one) => one.textContent === '01')

  check('a preparation sits above the head of the table',
    prep.getBoundingClientRect().bottom <= heading.getBoundingClientRect().top + 1,
    \`prep to \${prep.getBoundingClientRect().bottom.toFixed(0)}, head from \${heading.getBoundingClientRect().top.toFixed(0)}\`)

  // \`Pfanne vorheizen\` belongs to the recipe, so it stands over the ingredient block.
  check('and one belonging to the recipe stands over the ingredient block',
    prep.getBoundingClientRect().right <= first.getBoundingClientRect().left + 1,
    \`prep to \${prep.getBoundingClientRect().right.toFixed(0)}, column 01 from \${first.getBoundingClientRect().left.toFixed(0)}\`)

  /*
   * Done, rolled along. It is as wide as the widest row still standing in it, and no
   * wider - it used to be the whole ingredient block whenever any row waited anywhere,
   * so one short row left over held a lane of nothing open beside it.
   *
   * The card here is roggenquarkbrot, where Haferflocken waits until column 04 while
   * every other row has gone into a step by column 03.
   */
  const scroll = tall.querySelector('.scroll')
  const place = tall.querySelector('.place')
  const block = tall.querySelector('.grid .label.heading').getBoundingClientRect().width
  let narrowest = Infinity
  let grew = 0

  const roll = (at) => {
    if (at > 2400) {
      check('Done shrinks to the row still standing in it, not the whole block',
        narrowest < block - 100, \`narrowest \${narrowest.toFixed(0)}, block \${block.toFixed(0)}\`)
      check('and no row gains a line as Done closes up', grew < 30, \`tallest row \${grew.toFixed(0)}\`)
      report()
      return
    }
    scroll.scrollLeft = at
    scroll.dispatchEvent(new Event('scroll'))
    setTimeout(() => {
      const wide = Number.parseFloat(place.style.width) || 0
      // Only while a row is still standing: past that Done is one step wide by both
      // rules, and proves nothing either way.
      // A row is standing while its own span still reaches the left edge - which is the
      // same thing that keeps its sticky cells there, so it needs no second rule.
      const standing = [...tall.querySelectorAll('.grid > .hold')].some(
        (one) => one.getBoundingClientRect().right > scroll.getBoundingClientRect().left + 1,
      )
      if (standing && wide > 0) narrowest = Math.min(narrowest, wide)
      for (const one of tall.querySelectorAll('.grid > .hold'))
        grew = Math.max(grew, one.getBoundingClientRect().height)
      roll(at + 240)
    }, 320)
  }
  roll(0)
})

function report() {
  const out = document.createElement('pre')
  out.id = 'checks'
  out.textContent = said.join('\\n')
  document.body.append(out)
}
`

const app = fileURLToPath(new URL('../app', import.meta.url))
const page = join(app, '_check.html')
const code = join(app, '_check.js')
const index = await readFile(join(app, 'index.html'), 'utf8')

const data = await mkdtemp(join(tmpdir(), 'lekka-check-'))
const store = await openStore(data).open()
const server = createServer(handler(store, { app, createToken: null, maxBytes: 65536 }))

let failed = 0
try {
  await writeFile(page, index.replace('/main.js', '/_check.js'))
  await writeFile(code, CHECKS)
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
  const { port } = server.address()

  const chrome = CHROMES.find(existsSync)
  if (!chrome) throw new Error(`no Chrome found. Set CHROME.\ntried:\n  ${CHROMES.join('\n  ')}`)
  const dom = await run(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--enable-logging=stderr',
    '--v=0',
    '--virtual-time-budget=30000',
    '--window-size=1100,2400',
    '--dump-dom',
    `http://127.0.0.1:${port}/_check.html`,
  ])

  // No block at all means the page threw before it could say anything, which is a
  // failure of every check rather than of none.
  const found = /<pre id="checks">([\s\S]*?)<\/pre>/.exec(dom)
  if (!found) throw new Error('the page reported nothing: it threw before it could')
  const lines = found[1].split('\n').map(unescape)
  for (const line of lines) console.log(line)
  failed = lines.filter((line) => line.startsWith('FAIL')).length
  console.log(`\n${lines.length - failed} passed, ${failed} failed`)
} finally {
  server.close()
  await Promise.all([rm(page, { force: true }), rm(code, { force: true }), rm(data, { recursive: true, force: true })])
}
process.exit(failed > 0 ? 1 : 0)

function unescape(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
}

function run(command, args) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let said = ''
    child.stdout.on('data', (chunk) => (out += chunk))
    child.stderr.on('data', (chunk) => (said += chunk))
    child.on('error', fail)
    child.on('exit', (code) => {
      const bad = said.split('\n').filter((line) => /ERROR:CONSOLE|Uncaught|Failed to (load|fetch)/.test(line))
      if (code !== 0) return fail(new Error(`${command} exited ${code}\n${said}`))
      if (bad.length > 0) return fail(new Error(`the page failed:\n${bad.join('\n')}`))
      done(out)
    })
  })
}
