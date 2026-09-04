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

/* A card whose rows wait: `Zucker` stands through a column before the step that takes
   it, so its row is wider than its own three fields and the free area is drawn over the
   part it is waiting in. That overlap is the one this file exists to measure. */
const WAITING = `# Waiting

- braten
  - verrühren
    - Mehl: 250 g
    - Milch: 500 ml
  - Zucker: 2 EL
`

/**
 * The checks, as the page runs them. Each one says what it is asking in the words the
 * code uses, so a failure reads as a sentence about the app rather than a line number.
 */
const CHECKS = `
import { parseCard } from './card.js'
import { renderReading } from './read.js'
import { buildEditor } from './editor.js'
import { toDraft, addIngredient } from './edit.js'

const TEXT = ${JSON.stringify(CARD)}
const WAITING = ${JSON.stringify(WAITING)}
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

const braten = [...second.querySelectorAll('.grid .holds > .step')].find((one) => one.textContent.startsWith('braten'))
braten.click()

const waiting = [...second.querySelectorAll('.grid > .hold')].find((one) => one.textContent.includes('Zucker'))
const inked = [...waiting.children].at(-1).getBoundingClientRect()
const wide = waiting.getBoundingClientRect()
check('a waiting row is wider than its own fields', wide.right - inked.right > 40,
  \`row to \${wide.right.toFixed(0)}, fields to \${inked.right.toFixed(0)}\`)
check('and is painted all the way across', getComputedStyle(waiting).backgroundColor !== 'rgba(0, 0, 0, 0)',
  getComputedStyle(waiting).backgroundColor)

document.querySelector('dialog.compose[open]')?.close()
const blank = document.elementFromPoint((inked.right + wide.right) / 2, (wide.top + wide.bottom) / 2)
check('and a tap in the part it waits through reaches the row',
  blank === waiting || waiting.contains(blank),
  blank?.className)

/*
 * Fit to screen. \`zoom\` scales every length inside the table, so a band told to be
 * \`--room\` wide is drawn at a fraction of the room it is supposed to span, and the
 * words centred in it sit left of centre.
 */
const narrow = document.createElement('div')
narrow.style.width = '360px'
document.getElementById('screen').append(narrow)
narrow.append(renderReading(parseCard(TEXT), 1, 0, { onAt: () => {}, onFits: () => {}, fit: true }))

requestAnimationFrame(() => {
  const band = narrow.querySelector('.grid > .preparation > .said').getBoundingClientRect().width
  const room = narrow.querySelector('.scroll').getBoundingClientRect().width
  check('a pinned band spans the room even when the card is shrunk to fit',
    Math.abs(band - room) < 2, \`band \${band.toFixed(1)} vs room \${room.toFixed(1)}\`)

  const out = document.createElement('pre')
  out.id = 'checks'
  out.textContent = said.join('\\n')
  document.body.append(out)
})
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
    '--virtual-time-budget=4000',
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
