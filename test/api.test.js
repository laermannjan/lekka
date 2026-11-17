import test from 'node:test'
import assert from 'node:assert/strict'

import * as api from '../app/api.js'

test("the worker's copy is told from the server's answer, and dated by it", async () => {
  const date = 'Tue, 17 Nov 2026 10:23:32 GMT'
  const answer = (headers) => async () => new Response('[]', { headers: { date, ...headers } })
  const real = globalThis.fetch
  try {
    globalThis.fetch = answer({ 'x-lekka-offline': '1' })
    await api.cards()
    assert.deepEqual(api.offline, new Date(date))

    globalThis.fetch = answer({})
    await api.cards()
    assert.equal(api.offline, null)
  } finally {
    globalThis.fetch = real
  }
})
