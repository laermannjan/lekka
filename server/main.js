import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

import { openStore } from './store.js'
import { handler } from './http.js'

const DAY = 24 * 60 * 60 * 1000

const port = Number(process.env.PORT ?? 8080)
const store = await openStore(process.env.DATA_DIR ?? './data').open()

const days = Number(process.env.TTL_DAYS ?? 0)
if (days > 0) {
  const sweep = () => Promise.all([store.cards.sweep(days), store.collections.sweep(days)])
  await sweep()
  setInterval(sweep, DAY).unref()
}

const server = createServer(
  handler(store, {
    app: fileURLToPath(new URL('../app', import.meta.url)),
    createToken: process.env.CREATE_TOKEN || null,
    maxBytes: Number(process.env.MAX_CARD_BYTES ?? 65536),
  }),
)

server.listen(port, () => console.log(`lekka on http://localhost:${port}`))

for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => server.close(() => process.exit(0)))
