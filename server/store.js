import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { newId } from '../app/id.js'

const KEY_LENGTH = 22
const DAY = 24 * 60 * 60 * 1000

/** The data directory. Get by id is the only way in; there is no listing. */
export function openStore(directory) {
  const card = (id) => join(directory, `${id}.lekka`)
  const envelope = (id) => join(directory, `${id}.json`)

  const readEnvelope = async (id) => {
    try {
      return JSON.parse(await readFile(envelope(id), 'utf8'))
    } catch {
      return null
    }
  }

  const put = async (path, text) => {
    const temporary = `${path}.${newId(6)}`
    await writeFile(temporary, text)
    await rename(temporary, path)
  }

  return {
    async open() {
      await mkdir(directory, { recursive: true })
      return this
    },

    async create(text) {
      const id = newId()
      const key = newId(KEY_LENGTH)
      const now = new Date().toISOString()
      await put(card(id), text)
      await put(envelope(id), JSON.stringify({ key: hash(key), created: now, updated: now, touched: now }))
      return { id, key }
    },

    async read(id) {
      const meta = await readEnvelope(id)
      if (!meta) return null
      const text = await readFile(card(id), 'utf8').catch(() => null)
      return text === null ? null : { text, meta }
    },

    async write(id, text) {
      const meta = await readEnvelope(id)
      if (!meta) return false
      await put(card(id), text)
      const now = new Date().toISOString()
      await put(envelope(id), JSON.stringify({ ...meta, updated: now, touched: now }))
      return true
    },

    async remove(id) {
      await unlink(card(id)).catch(() => {})
      await unlink(envelope(id)).catch(() => {})
    },

    async verify(id, key) {
      const meta = await readEnvelope(id)
      return meta ? same(meta.key, hash(key ?? '')) : false
    },

    /** Reads keep a card alive, but at most one write a day. */
    async touch(id) {
      const meta = await readEnvelope(id)
      if (!meta) return
      const now = new Date()
      if (now - new Date(meta.touched) < DAY) return
      await put(envelope(id), JSON.stringify({ ...meta, touched: now.toISOString() }))
    },

    async sweep(days) {
      const limit = Date.now() - days * DAY
      const names = await readdir(directory)
      for (const name of names.filter((name) => name.endsWith('.json'))) {
        const id = name.slice(0, -'.json'.length)
        const meta = await readEnvelope(id)
        if (meta && new Date(meta.touched).getTime() < limit) await this.remove(id)
      }
    },
  }
}

function hash(key) {
  return createHash('sha256').update(key).digest('hex')
}

function same(a, b) {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}
