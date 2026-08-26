import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

import { openStore } from './store.js'
import { handler } from './http.js'

const DAY = 24 * 60 * 60 * 1000

const port = Number(process.env.PORT ?? 8080)
const store = await openStore(process.env.DATA_DIR ?? './data').open()

const sweep = Number(process.env.TTL_DAYS ?? 0)
if (sweep > 0) {
  const run = () => Promise.all([store.cards.sweep(sweep), store.collections.sweep(sweep)])
  await run()
  setInterval(run, DAY).unref()
}

createServer(
  handler(store, {
    app: fileURLToPath(new URL('../app', import.meta.url)),
    createToken: process.env.CREATE_TOKEN || null,
    maxBytes: Number(process.env.MAX_CARD_BYTES ?? 65536),
  }),
).listen(port, () => console.log(`http://localhost:${port}`))
