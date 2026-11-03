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

import { openDb } from '../server/db.js'
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

const TEXT = ${JSON.stringify(CARD)}
const LONG = ${JSON.stringify(LONG)}
const said = []
const check = (name, ok, detail = '') =>
  said.push(\`\${ok ? 'PASS' : 'FAIL'} \${name}\${detail ? \` :: \${detail}\` : ''}\`)

// The table is still drawn as the datasheet, whose rules reach only what is inside one.
document.getElementById('screen').classList.add('datasheet')

/*
 * Density. A row is a line of a recipe, and a line should say itself in a line: the
 * ingredient names were held to 200px while a card was being read, so a qualifier
 * broke onto its own line and half the table was air.
 */
const tall = document.createElement('div')
document.getElementById('screen').append(tall)
tall.append(renderReading(parseCard(LONG), 1, 0, { onAt: () => {}, onFits: () => {} }))

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
  const { least, most } = linesOf(tall)
  check('every row says itself in one line', most < least * 1.4, \`\${least.toFixed(1)} to \${most.toFixed(1)}\`)

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

  /*
   * The head of the table is closed on both sides. Preparations stand above it, so it is
   * no longer the first row and the box around the table no longer draws its top rule.
   */
  const banded = tall.querySelector('.grid')
  const shut = getComputedStyle(banded.querySelector('.label.heading')).borderTopWidth
  check('the head of a table with preparations over it has a rule above it',
    banded.classList.contains('banded') && shut !== '0px', banded.className + ' ' + shut)

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

  report()
})

function report() {
  const out = document.createElement('pre')
  out.id = 'checks'
  out.textContent = said.join('\\n')
  document.body.append(out)
}
`

/**
 * The second pass: the app itself, with its own `main.js` running.
 *
 * Everything above renders a module into a bare page. That leaves the router and the
 * masthead untested, and both hold state across a change of screen - `show` replaces
 * the screen and not the masthead, so a control put there by one view outlives it. A
 * scale button left over from reading answers with `showCard`, which re-reads the recipe
 * from the server: pressing it while writing threw the draft away without asking.
 */
const DRIVES = `
const said = []
const check = (name, ok, detail = '') =>
  said.push(\`\${ok ? 'PASS' : 'FAIL'} \${name}\${detail ? \` :: \${detail}\` : ''}\`)

const editing = () => Boolean(document.querySelector('.writer'))
// Only a button that can be seen, as a person would press. A closed sheet stays in the
// page until its \`close\` event removes it, which headless Chrome can send hundreds of
// milliseconds late, and its buttons come before those of the sheet opened after it.
const named = (text) =>
  [...document.querySelectorAll('button')].find((one) => one.checkVisibility() && one.textContent.trim() === text)
const labelled = (text) => document.querySelector(\`button[aria-label="\${text}"]\`)
const after = (wait) => new Promise((go) => setTimeout(go, wait))

addEventListener('load', async () => {
  await after(700)

  // Opened at an older link, which carried a secret after the id. Nothing is addressed
  // to a string any more, so the address is read for its id and rewritten to just that.
  check('an older link is read for its id and rewritten to it',
    location.pathname.startsWith('/r/') && !location.pathname.slice(3).includes('/') && location.hash === '',
    location.pathname + ' + ' + (location.hash || '(no fragment)'))

  const title = document.querySelector('.recipe-title')?.textContent
  check('the recipe is open, under its name', title === 'Pfannkuchen', String(title))
  // Each step read out as a sentence, and what it takes listed under it.
  const steps = [...document.querySelectorAll('ol.method > li .sentence')].map((one) => one.textContent.replace(/\\s+/g, ' '))
  check('its steps in the order they are done',
    steps.join(' | ') === 'Pfanne vorheizen | Verrühren | Schmelzen | Braten 2 min je Seite',
    steps.join(' | '))
  const listed = () => [...document.querySelectorAll('ol.method > li .uses')]
    .map((list) => [...list.children].map((one) => [...one.children].map((part) => part.textContent).join(' ')).join(', '))
    .join(' | ')
  check('and what each takes, under it', listed() === '250 g Mehl, 500 ml Milch, 2 Eier | 30 g Butter', listed())
  // An amount is a field to type in; what it says is its value, then its unit.
  const shows = (part) => [...part.querySelectorAll('input')].map((field) => field.value).concat(part.textContent).join(' ')
  const gathered = [...document.querySelectorAll('.overview .line')].map((one) => [...one.children].map(shows).join(' ').replace(/\\s+/g, ' ').trim())
  check('and above them everything that goes in, once', gathered.join(' | ') === '250 g Mehl Type 550 | 500 ml Milch | 2 Eier | 30 g Butter',
    gathered.join(' | '))

  // The stepper counts what it makes, and the gathered amounts hang from the middle of it.
  const count = () => document.querySelector('.stepper .count')?.textContent
  const middle = (box) => (box.left + box.right) / 2
  const counted = document.querySelector('.stepper .count').getBoundingClientRect()
  const mehl = document.querySelector('.overview .amount').getBoundingClientRect()
  check('the amounts gathered end under the middle of the count', Math.abs(mehl.right + 6 - middle(counted)) < 2,
    \`amount to \${mehl.right.toFixed(0)}, count's middle at \${middle(counted).toFixed(0)}\`)
  labelled('More').click()
  await after(100)
  check('one more makes one more, and every amount follows',
    count() === '13' && document.querySelector('.overview input').value === '271' && listed().startsWith('271 g Mehl'),
    \`\${count()}, \${document.querySelector('.overview input').value}, \${listed()}\`)
  labelled('Less').click()
  await after(100)
  check('and one fewer takes it back', count() === '12' && listed().startsWith('250 g Mehl'), \`\${count()}, \${listed()}\`)

  // What to buy: everything at nothing at home, until it is typed in or crossed out.
  named('Shopping list').click()
  await after(400)
  const buying = () => [...document.querySelectorAll('ul.shop:not(.home) .line')]
    .map((one) => \`\${one.querySelector('.name').textContent}: \${one.querySelector('.sub').textContent}\`).join(' | ')
  check('the shopping list starts with nothing at home',
    buying() === 'Mehl Type 550: 250 g to buy | Milch: 500 ml to buy | Eier: 2 to buy | Butter: 30 g to buy', buying())
  const flour = document.querySelector('ul.shop .line input')
  flour.value = '100'
  flour.dispatchEvent(new Event('input'))
  check('typing what is at home leaves the rest to buy', buying().startsWith('Mehl Type 550: 150 g still to buy'), buying())
  flour.dispatchEvent(new Event('change'))
  labelled('Milch: not needed, cross it out').click()
  await after(300)
  const home = () => [...document.querySelectorAll('ul.shop.home .name')].map((one) => one.textContent).join(', ')
  check('a line tapped is crossed out, at home', !buying().includes('Milch') && home() === 'Milch', \`\${buying()} / \${home()}\`)
  labelled('Milch: put back on the list').click()
  await after(300)
  check('and a tap brings it back', buying().includes('Milch: 500 ml to buy') && home() === '', \`\${buying()} / \${home()}\`)
  labelled('Back to the recipe').click()
  await after(500)

  check('cooking starts from the bar at the bottom', Boolean(document.querySelector('#dock .start')))

  // The table is the datasheet's, inside a box of its own, so its rules reach it.
  labelled('Table, edit, share or delete').click()
  await after(300)
  named('Show as a table').click()
  await after(400)
  const grid = document.querySelector('.datasheet.table .grid')
  check('the table is drawn as the datasheet draws it',
    Boolean(grid) && getComputedStyle(grid).display === 'grid',
    grid ? getComputedStyle(grid).display : 'no table')

  labelled('Table, edit, share or delete').click()
  await after(300)
  check('the menu offers to edit it', Boolean(named('Edit')))
  named('Edit').click()
  await after(500)
  check('writing, the recipe is on the screen as it reads', editing())
  check('and the menu has gone', !document.querySelector('dialog[open]'))
  check('its name is a field', document.querySelector('.writer input.title')?.value === 'Pfannkuchen')
  check('and what comes before the first step is a line of the recipe, not a step',
    document.querySelector('.before-list input')?.value === 'Pfanne vorheizen')
  const written = () => [...document.querySelectorAll('.writing > li .sentence')].map((one) => one.textContent.replace(/\\s+/g, ' ')).join(' | ')
  check('its steps are listed as they are read', written() === 'Verrühren | Schmelzen | Braten 2 min je Seite', written())
  const lines = [...document.querySelectorAll('.writing > li')].map((one) => Boolean(one.querySelector('.divider [aria-label^="Merge"]')))
  check('a step joins the one above only where that one goes straight into it', lines.join() === 'false,false,true', lines.join())

  // A step opened: its sentence typed plainly, the names it says found on their own.
  document.querySelector('.writing > li .said').click()
  await after(300)
  const sentence = document.querySelector('dialog[open] textarea.sentence')
  sentence.value = 'Mehl und Milch glatt verrühren'
  sentence.dispatchEvent(new Event('input'))
  const ticked = [...document.querySelectorAll('dialog[open] .part:first-of-type .chip')].map((one) => \`\${one.textContent}:\${one.getAttribute('aria-pressed')}\`)
  check('a step opened finds the names its sentence says', ticked.join(' ') === 'Mehl:true Milch:true Eier:false', ticked.join(' '))
  named('Done').click()
  await after(300)
  check('and done, says it so', written().startsWith('Mehl und Milch glatt verrühren'), written())

  // A step added under the last, then deleted, then taken back.
  ;[...document.querySelectorAll('.writing > li .add-step')].at(-1).click()
  await after(300)
  const next = document.querySelector('dialog[open] textarea.sentence')
  next.value = 'auf einem Teller anrichten'
  next.dispatchEvent(new Event('input'))
  named('Done').click()
  await after(300)
  check('a step added under the last one comes after it', written().endsWith('Auf einem Teller anrichten'), written())
  ;[...document.querySelectorAll('.writing > li .said')].at(-1).click()
  await after(300)
  named('Delete step').click()
  await after(300)
  check('a step deleted is gone, and can be had back', !written().includes('Teller') && Boolean(named('Undo')), written())
  named('Undo').click()
  await after(200)
  check('and is back', written().endsWith('Auf einem Teller anrichten'), written())

  named('Save').click()
  await after(800)
  const read = [...document.querySelectorAll('ol.method > li .sentence')].map((one) => one.textContent.replace(/\\s+/g, ' '))
  check('saved, the recipe reads as it was written', read.join(' | ') === 'Pfanne vorheizen | Mehl und Milch glatt verrühren | Schmelzen | Braten 2 min je Seite | Auf einem Teller anrichten', read.join(' | '))
  check('and what comes before stands unnumbered', document.querySelector('ol.method .before .n')?.textContent === 'before')

  const out = document.createElement('pre')
  out.id = 'checks'
  out.textContent = said.join(String.fromCharCode(10))
  document.body.append(out)
})
`

const app = fileURLToPath(new URL('../app', import.meta.url))
const page = join(app, '_check.html')
const code = join(app, '_check.js')
const driver = join(app, '_drive.js')
const index = await readFile(join(app, 'index.html'), 'utf8')

const data = await mkdtemp(join(tmpdir(), 'lekka-check-'))
const store = await openStore(data, openDb(join(data, 'lekka.db'))).open()
const server = createServer(handler(store, { app, createToken: null, maxBytes: 65536 }))

let failed = 0
try {
  await writeFile(page, index.replace('/main.js', '/_check.js'))
  await writeFile(code, CHECKS)
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready))
  const { port } = server.address()

  const chrome = CHROMES.find(existsSync)
  if (!chrome) throw new Error(`no Chrome found. Set CHROME.\ntried:\n  ${CHROMES.join('\n  ')}`)

  const lines = await said(chrome, port, '/_check.html', '1100,2400')

  // The second pass drives the app itself, so it needs the app's own page - which is
  // the one file this cannot make a copy of, because the router answers for its address.
  await writeFile(driver, DRIVES)
  await writeFile(join(app, 'index.html'), index.replace('</body>', '  <script src="/_drive.js"></script>\n  </body>'))
  const made = await fetch(`http://127.0.0.1:${port}/api/cards`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: CARD,
  }).then((one) => one.json())
  lines.push(...await said(chrome, port, `/r/${made.id}/somethingolder`, '1280,900'))

  for (const line of lines) console.log(line)
  failed = lines.filter((line) => line.startsWith('FAIL')).length
  console.log(`\n${lines.length - failed} passed, ${failed} failed`)
} finally {
  server.close()
  // The app's own page is put back from the text it was read with, whatever happened.
  await writeFile(join(app, 'index.html'), index)
  await Promise.all([
    rm(page, { force: true }),
    rm(code, { force: true }),
    rm(driver, { force: true }),
    rm(data, { recursive: true, force: true }),
  ])
}
process.exit(failed > 0 ? 1 : 0)

/** One page driven, and the lines it reported. */
async function said(chrome, port, path, size) {
  const dom = await run(chrome, [
    '--headless=new',
    // The checks read what the screens say in English, whatever this machine speaks.
    '--lang=en-US',
    '--disable-gpu',
    '--hide-scrollbars',
    '--enable-logging=stderr',
    '--v=0',
    '--virtual-time-budget=30000',
    `--window-size=${size}`,
    '--dump-dom',
    `http://127.0.0.1:${port}${path}`,
  ])

  // No block at all means the page threw before it could say anything, which is a
  // failure of every check rather than of none.
  const found = /<pre id="checks">([\s\S]*?)<\/pre>/.exec(dom)
  if (!found) throw new Error(`${path} reported nothing: it threw before it could`)
  return found[1].split('\n').map(unescape)
}

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
