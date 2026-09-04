/**
 * A picture of the app, for the parts of it a stub DOM cannot answer for.
 *
 * `ARCHITECTURE.md` says the app builds no element it does not mean, so a missing button
 * cannot be hidden by a stylesheet. That holds for what is *there*. It says nothing
 * about what a stylesheet does to what is there, and a grid template that a browser
 * rejects silently falls back to `none`: every element present, every one in the wrong
 * place, every test still green. That is not hypothetical - it happened while this was
 * being written, and comparing two of these is what caught it.
 *
 *   node tools/shot.mjs [out.png]
 *
 * Needs Chrome. Set CHROME to point at another one.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
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

- braten (2 min je Seite)
  - verrühren
    - Mehl (Type 550): 250 g
    - Milch: 500 ml
    - Eier: 2
  - schmelzen
    - Butter: 30 g
`

/** Each scene is a heading and something to put under it, drawn one above the other. */
const SCENES = `
import { parseCard } from './card.js'
import { renderCard } from './render.js'
import { renderReading } from './read.js'
import { buildEditor } from './editor.js'
import { toDraft, addIngredient } from './edit.js'

const TEXT = ${JSON.stringify(CARD)}
const screen = document.getElementById('screen')
const editor = () =>
  buildEditor({
    draft: addIngredient(toDraft(parseCard(TEXT)), { name: 'Zucker', amount: '2', unit: 'EL' }),
    onSave: async () => null,
    onClose: () => {},
  })

scene('Card view', wrap(renderCard(parseCard(TEXT), 1)))

// The same card in a box too narrow for it, which is the only way the reading
// affordances appear: they are not a mode to be asked for.
scene('Reading, a card wider than its box', narrow(renderReading(parseCard(TEXT), 1, 0, () => {})))

// The two states a card passes through before it has a single step, which is where
// the table has no step columns at all.
scene('Editor, a new card', buildEditor({ draft: toDraft(parseCard('# Neu\\n')), onSave: async () => null, onClose: () => {} }))
scene('Editor, ingredients but no step', buildEditor({
  draft: ['Mehl', 'Milch'].reduce((d, name) => addIngredient(d, { name, amount: '250', unit: 'g' }), toDraft(parseCard('# Neu\\n'))),
  onSave: async () => null,
  onClose: () => {},
}))

scene('Editor, at rest', editor())

// A step opened, which is the only state in which the boxes hold anything: they stand
// for what this step may take, ticked where it already takes it.
const opened = editor()
scene('Editor, a step open with its boxes', opened)
for (const cell of opened.querySelectorAll('.grid .holds > .step'))
  if (cell.textContent.startsWith('verrühren')) cell.onclick()

// A row opened. Its four fields need no names: they stand in the columns that name them.
const row = editor()
scene('Editor, a row open', row)
row.querySelector('.grid > .hold .name').click()

function scene(name, body) {
  const head = document.createElement('div')
  head.className = 'band'
  head.textContent = name.toUpperCase()
  screen.append(head, body)
}

/** A box that no card of this size fits, so the card has somewhere to scroll to. */
function narrow(view) {
  const box = document.createElement('div')
  box.style.width = '320px'
  box.append(view)
  return box
}

function wrap(table) {
  const box = document.createElement('div')
  box.className = 'scroll'
  box.append(table)
  return box
}
`

const app = fileURLToPath(new URL('../app', import.meta.url))
const out = process.argv[2] ?? join(process.cwd(), 'shot.png')
const page = join(app, '_shot.html')
const code = join(app, '_shot.js')

const shell = (await import('node:fs/promises')).readFile
const index = await shell(join(app, 'index.html'), 'utf8')

const data = await mkdtemp(join(tmpdir(), 'lekka-shot-'))
const store = await openStore(data).open()
const server = createServer(handler(store, { app, createToken: null, maxBytes: 65536 }))

try {
  await writeFile(page, index.replace('/main.js', '/_shot.js'))
  await writeFile(code, SCENES)
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
  const { port } = server.address()

  const chrome = CHROMES.find(existsSync)
  if (!chrome) throw new Error(`no Chrome found. Set CHROME.\ntried:\n  ${CHROMES.join('\n  ')}`)
  await run(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    // A module that throws leaves a blank page, which looks like a picture of nothing
    // rather than like a failure. Say it instead.
    '--enable-logging=stderr',
    '--v=0',
    '--virtual-time-budget=4000',
    '--window-size=1100,3000',
    `--screenshot=${out}`,
    `http://127.0.0.1:${port}/_shot.html`,
  ])
  console.log(out)
} finally {
  server.close()
  await Promise.all([rm(page, { force: true }), rm(code, { force: true }), rm(data, { recursive: true, force: true })])
}

function run(command, args) {
  return new Promise((done, fail) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let said = ''
    child.stderr.on('data', (chunk) => (said += chunk))
    child.on('error', fail)
    child.on('exit', (code) => {
      const bad = said
        .split('\n')
        .filter((line) => /ERROR:CONSOLE|Uncaught|Failed to (load|fetch)/.test(line))
      if (code !== 0) return fail(new Error(`${command} exited ${code}\n${said}`))
      if (bad.length > 0) return fail(new Error(`the page failed:\n${bad.join('\n')}`))
      done()
    })
  })
}
