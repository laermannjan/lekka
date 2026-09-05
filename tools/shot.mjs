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

/* A card with rows that wait: six ingredients stand through two columns before the
   step that takes them, which is where a row is wider than its own fields. */
const LONG = await (await import('node:fs/promises')).readFile(
  new URL('../test/cards/roggenquarkbrot.lekka', import.meta.url), 'utf8')

/** Each scene is a heading and something to put under it, drawn one above the other. */
const SCENES = `
import { parseCard } from './card.js'
import { renderCard } from './render.js'
import { renderReading } from './read.js'
import { buildEditor } from './editor.js'
import { buildForm } from './form.js'
import { toDraft, addIngredient, candidates } from './edit.js'

const TEXT = ${JSON.stringify(CARD)}
const LONG = ${JSON.stringify(LONG)}
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

/*
 * A step selected. This is the whole of what the table does while a recipe is being
 * written: a ring on the one thing the form holds, and a shading on what goes into it.
 * There is not a field in it, and not one column that was not there a moment ago.
 */
const opened = editor()
scene('Editor, a step selected', opened)
tapStep(opened, 'verrühren')

/*
 * The L. Here vermengen is an input of Stockgare, so it is coming in and shaded - and
 * its region is its own cell plus the blank its six waiting rows stand in, which
 * together make an L. Both halves take the colour, or the corner is missing.
 */
const wide = buildEditor({ draft: toDraft(parseCard(LONG)), onSave: async () => null, onClose: () => {} })
scene('Editor, a step coming in, shaded over its whole L', wide)
tapStep(wide, 'Stockgare')

/*
 * The form, drawn where it can be seen rather than over the page. It is a dialog: on
 * the real screen it is docked to the foot of the window with the page dimmed behind
 * it, which a picture of the whole page cannot show and a picture of the form can.
 */
const draft = toDraft(parseCard(LONG))
const vermengen = holds(draft.strands[0], 'vermengen')
scene('The form, on a step', inline(buildForm({
  node: vermengen,
  place: 'column 03',
  offers: candidates(draft, vermengen),
  onChoose: () => {},
  onApply: () => {},
  onDrop: () => {},
  onClose: () => {},
})))

const mehl = rowsOf(draft.strands[0]).find((one) => one.name === 'Roggenvollkornmehl')
scene('The form, on a row', inline(buildForm({
  node: mehl,
  place: '',
  onApply: () => {},
  onDrop: () => {},
  onClose: () => {},
})))

/** A tap on the step whose verb starts with this. */
function tapStep(view, verb) {
  for (const cell of view.querySelectorAll('.grid .holds > .step'))
    if (cell.textContent.startsWith(verb)) cell.onclick()
  // The form it opens is a modal dialog, and a modal dialog in a picture of the page
  // covers the page. The table is the subject here, so it is shut again at once.
  for (const box of document.querySelectorAll('dialog.compose')) box.remove()
}

/** A dialog drawn as a block, so it appears in a picture of the page at all. */
function inline(box) {
  box.style.position = 'static'
  box.style.display = 'block'
  box.style.maxWidth = '640px'
  box.style.margin = '0'
  return box
}

function holds(node, verb) {
  if (node.verb?.startsWith(verb)) return node
  for (const child of node.children ?? []) {
    const found = holds(child, verb)
    if (found) return found
  }
  return null
}

function rowsOf(node) {
  if (node.kind === 'ingredient') return [node]
  return (node.children ?? []).flatMap(rowsOf)
}

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
  // Served as a file rather than through `page()`, so the head it stamps is put in by hand.
  await writeFile(
    page,
    index.replace('/main.js', '/_shot.js').replace('%HEAD%', '<title>lekka</title>'),
  )
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
    '--window-size=1100,4200',
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
