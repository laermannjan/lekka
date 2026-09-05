import { createServer } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { newId } from '../app/id.js'
import { guarded, mode as readMode } from './access.js'
import { openDb } from './db.js'
import { openGrants } from './grants.js'
import { openInvites } from './invites.js'
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
const grants = openGrants(db)
const store = await openStore(directory, db, grants).open()

/* People exist only where there is a door. The tables are always there; an instance with
 * no access control simply never has a row in them, and every route below sees `null`. */
const mode = readMode(process.env.ACCESS_CONTROL)
const people = guarded(mode) ? openPeople(db) : null
const invites = guarded(mode) ? openInvites(db) : null

/* A recipe made while `ACCESS_CONTROL` was `NONE` has no owner, because there was
 * nobody to own it - and under `GRANT` a recipe nobody owns is one nobody can reach.
 * Whoever keeps the instance takes them, at every boot rather than only at the first,
 * so turning the door off for an afternoon and back on again does not strand what was
 * written in between. With no orphans it does nothing, which is most boots. */
const operator = people?.operator()
if (operator) {
  const taken = grants.adopt(operator.id)
  if (taken > 0) console.log(`${taken} recipes had no owner and are now ${operator.name}'s.`)
}

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
  const sweep = () => store.sweep(days)
  await sweep()
  setInterval(sweep, DAY).unref()
}

/* Every limit is off unless set: a household network already has one, and a recipe box
 * that starts refusing its owner is worse than no limit at all. */
const server = createServer(
  handler(store, {
    app: fileURLToPath(new URL('../app', import.meta.url)),
    people,
    invites,
    grants,
    mode,
    bootstrap,
    createToken: process.env.CREATE_TOKEN || null,
    maxBytes: number(process.env.MAX_CARD_BYTES, 65536),
    createsPerHour: number(process.env.MAX_CREATES_PER_HOUR, 0),
    triesPerMinute: number(process.env.MAX_TRIES_PER_MINUTE, 0),
    trustProxy: process.env.TRUST_PROXY === '1',
  }),
)

server.listen(port, () => console.log(`lekka on http://localhost:${port}`))

for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)))
