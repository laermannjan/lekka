import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

import { openStore } from './store.js'
import { handler } from './http.js'

const DAY = 24 * 60 * 60 * 1000

/** A setting that is not a number falls back, so a typo cannot quietly lift a limit. */
function number(value, fallback) {
  const parsed = Number(value)
  return value !== undefined && Number.isFinite(parsed) ? parsed : fallback
}

const port = number(process.env.PORT, 8080)
const store = await openStore(process.env.DATA_DIR ?? './data').open()

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
