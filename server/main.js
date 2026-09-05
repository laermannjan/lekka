import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { newId } from '../app/id.js'
import { mode as readMode } from './access.js'
import { openDb } from './db.js'
import { openPeople } from './people.js'
import { openStore } from './store.js'
import { handler } from './http.js'

const DAY = 24 * 60 * 60 * 1000

/** A setting that is not a number falls back, so a typo cannot quietly lift a limit. */
function number(value, fallback) {
  const parsed = Number(value)
  return value !== undefined && Number.isFinite(parsed) ? parsed : fallback
}

const port = number(process.env.PORT, 8080)
const directory = process.env.DATA_DIR ?? './data'
const db = openDb(join(directory, 'lekka.db'))
const store = await openStore(directory, db).open()

/* People exist only where there is a door. The tables are always there; a public
 * instance simply never has a row in them, and every route below sees `null`. */
const mode = readMode(process.env.ACCESS)
const people = mode === 'public' ? null : openPeople(db)

/* An instance with a door and nobody behind it needs a first person, and reaching the
 * port first must not be what decides who that is. The operator reads this out of the
 * logs; it lives only in this process, so a restart issues a new one. */
let bootstrap = null
if (people?.empty()) {
  bootstrap = newId(22)
  console.log(`lekka has no people yet. Open /join#${bootstrap} to make the first one.`)
}

const days = number(process.env.TTL_DAYS, 0)
if (days > 0) {
  const sweep = () => Promise.all([store.cards.sweep(days), store.collections.sweep(days)])
  await sweep()
  setInterval(sweep, DAY).unref()
}

/* Every limit is off unless set: a household network already has one, and a recipe box
 * that starts refusing its owner is worse than no limit at all. */
const server = createServer(
  handler(store, {
    app: fileURLToPath(new URL('../app', import.meta.url)),
    people,
    mode,
    bootstrap,
    createToken: process.env.CREATE_TOKEN || null,
    maxBytes: number(process.env.MAX_CARD_BYTES, 65536),
    maxRows: number(process.env.MAX_COLLECTION_ROWS, 0),
    createsPerHour: number(process.env.MAX_CREATES_PER_HOUR, 0),
    triesPerMinute: number(process.env.MAX_TRIES_PER_MINUTE, 0),
    trustProxy: process.env.TRUST_PROXY === '1',
  }),
)

server.listen(port, () => console.log(`lekka on http://localhost:${port}`))

for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)))
