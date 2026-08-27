import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { newId } from '../app/id.js'
import { cardId, collectionId } from './names.js'

const KEY_LENGTH = 22
const DAY = 24 * 60 * 60 * 1000

/** Two shelves of the same kind. Get by id is the only way in; there is no listing. */
export function openStore(directory) {
  return {
    cards: shelf(join(directory, 'cards'), '.lekka', cardId),
    collections: shelf(join(directory, 'collections'), '.json', collectionId),
    async open() {
      await this.cards.open()
      await this.collections.open()
      return this
    },
  }
}

function shelf(directory, extension, nextId) {
  const body = (id) => join(directory, id + extension)
  const envelope = (id) => join(directory, `${id}.meta.json`)

  const meta = async (id) => {
    if (!/^[a-z0-9-]{1,64}$/.test(id ?? '')) return null
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
    },

    async create(text, label) {
      let id = nextId(label)
      while (await meta(id)) id = nextId(label)

      const key = newId(KEY_LENGTH)
      const now = new Date().toISOString()
      await put(body(id), text)
      await put(envelope(id), JSON.stringify({ key: hash(key), created: now, updated: now, touched: now }))
      return { id, key }
    },

    async read(id) {
      if (!(await meta(id))) return null
      return readFile(body(id), 'utf8').catch(() => null)
    },

    async write(id, text) {
      const found = await meta(id)
      if (!found) return false
      const now = new Date().toISOString()
      await put(body(id), text)
      await put(envelope(id), JSON.stringify({ ...found, updated: now, touched: now }))
      return true
    },

    async remove(id) {
      await unlink(body(id)).catch(() => {})
      await unlink(envelope(id)).catch(() => {})
    },

    async verify(id, key) {
      const found = await meta(id)
      return found ? same(found.key, hash(key ?? '')) : false
    },

    /** Reads keep a record alive, but at most one write a day. */
    async touch(id) {
      const found = await meta(id)
      if (!found) return
      const now = new Date()
      if (now - new Date(found.touched) < DAY) return
      await put(envelope(id), JSON.stringify({ ...found, touched: now.toISOString() }))
    },

    /**
     * Also reaps what an interrupted write left behind: a body with no envelope is
     * unreachable, since everything here is found through the envelope, and a temporary
     * belongs to a rename that never happened.
     */
    async sweep(days) {
      const limit = Date.now() - days * DAY
      const names = await readdir(directory)
      const kept = new Set()

      for (const name of names) {
        if (!name.endsWith('.meta.json')) continue
        const id = name.slice(0, -'.meta.json'.length)
        const found = await meta(id)
        if (found && new Date(found.touched).getTime() < limit) await this.remove(id)
        else kept.add(id)
      }

      for (const name of names) {
        if (name.endsWith('.meta.json')) continue
        if (name.endsWith(extension) && kept.has(name.slice(0, -extension.length))) continue
        const path = join(directory, name)
        const found = await stat(path).catch(() => null)
        if (found?.isFile() && found.mtimeMs < limit) await unlink(path).catch(() => {})
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
