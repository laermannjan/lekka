import { createHash, timingSafeEqual } from 'node:crypto'
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { newId } from '../app/id.js'
import { inside } from './db.js'
import { cardId, collectionId } from './names.js'

const KEY_LENGTH = 22
const DAY = 24 * 60 * 60 * 1000
const ID = /^[a-z0-9-]{1,64}$/

/**
 * Two shelves of the same kind. A card's body is a file; a collection's is a column.
 * Everything else about both - the key hash, the owner, the three dates - is a row.
 */
export function openStore(directory, db) {
  return {
    cards: shelf(db, 'card', { directory: join(directory, 'cards'), extension: '.lekka', nextId: cardId }),
    collections: shelf(db, 'collection', { nextId: collectionId }),
    async open() {
      await this.cards.open()
      await this.collections.open()
      // What an older data directory brought with it, so the operator can be told.
      this.adopted = await adopt(db, directory)
      return this
    },
  }
}

/** The version a write has to name, so two browsers cannot overwrite each other blind. */
export function tag(text) {
  return `"${createHash('sha256').update(text ?? '').digest('hex').slice(0, 16)}"`
}

function shelf(db, kind, { directory = null, extension = '', nextId }) {
  const path = (id) => join(directory, id + extension)

  const find = db.prepare('select * from records where kind = ? and id = ?')
  const add = db.prepare(
    'insert into records (kind, id, hash, owner, body, created, updated, touched) values (?, ?, ?, ?, ?, ?, ?, ?)',
  )
  const put = db.prepare(
    'update records set body = ?, updated = ?, touched = ? where kind = ? and id = ?',
  )
  const drop = db.prepare('delete from records where kind = ? and id = ?')
  const stamp = db.prepare('update records set touched = ? where kind = ? and id = ?')
  const owned = db.prepare(
    'select id, updated from records where kind = ? and owner = ? order by updated desc',
  )
  const older = db.prepare('select id from records where kind = ? and touched < ?')

  const row = (id) => (ID.test(id ?? '') ? (find.get(kind, id) ?? null) : null)

  /** A body goes to a temporary and is renamed into place, which a power cut cannot tear. */
  const write = async (id, text) => {
    const temporary = `${path(id)}.${newId(6)}`
    await writeFile(temporary, text)
    await rename(temporary, path(id))
  }

  return {
    async open() {
      if (directory) await mkdir(directory, { recursive: true })
    },

    async create(text, label, owner = null) {
      let id = nextId(label)
      while (row(id)) id = nextId(label)

      const key = newId(KEY_LENGTH)
      const now = new Date().toISOString()
      // The file first: a body with no row is unreachable and the sweep reaps it, while
      // a row with no body is a card that opens to nothing.
      if (directory) await write(id, text)
      add.run(kind, id, hash(key), owner, directory ? null : text, now, now, now)
      return { id, key }
    },

    async read(id) {
      const found = row(id)
      if (!found) return null
      if (!directory) return found.body
      return readFile(path(id), 'utf8').catch(() => null)
    },

    async write(id, text) {
      if (!row(id)) return false
      const now = new Date().toISOString()
      if (directory) await write(id, text)
      put.run(directory ? null : text, now, now, kind, id)
      return true
    },

    /**
     * A body swapped only if it still says what the writer thought it did. One
     * transaction rather than a queue in this process, so two of them cannot interleave
     * even if somebody runs a second copy of the server.
     */
    swap(id, text, expected) {
      return inside(db, () => {
        const found = find.get(kind, id)
        if (!found) return 'gone'
        if (expected !== '*' && tag(found.body) !== expected) return 'changed'
        const now = new Date().toISOString()
        put.run(text, now, now, kind, id)
        return 'written'
      })
    },

    async remove(id) {
      if (directory && ID.test(id ?? '')) await unlink(path(id)).catch(() => {})
      drop.run(kind, id)
    },

    async verify(id, key) {
      const found = row(id)
      return found ? same(found.hash, hash(key ?? '')) : false
    },

    /**
     * Who is answerable for this record, or null on anything made before there were
     * people - which reads as nobody's, so a private instance does not lock its operator
     * out of what they already had.
     */
    async owner(id) {
      return row(id)?.owner ?? null
    },

    /** What one person owns here. An index, not a walk of the directory. */
    async mine(person) {
      return person ? owned.all(kind, person) : []
    },

    /** Reads keep a record alive, but at most one write a day. */
    async touch(id) {
      const found = row(id)
      if (!found) return
      const now = new Date()
      if (now - new Date(found.touched) < DAY) return
      stamp.run(now.toISOString(), kind, id)
    },

    /**
     * What nobody has opened goes, and so does what an interrupted write left behind: a
     * body with no row is unreachable, since everything is found through the row, and a
     * temporary belongs to a rename that never happened.
     */
    async sweep(days) {
      const limit = Date.now() - days * DAY
      for (const { id } of older.all(kind, new Date(limit).toISOString())) await this.remove(id)
      if (!directory) return

      const kept = new Set(
        db.prepare('select id from records where kind = ?').all(kind).map((one) => one.id),
      )
      for (const name of await readdir(directory).catch(() => [])) {
        if (name.endsWith(extension) && kept.has(name.slice(0, -extension.length))) continue
        const file = join(directory, name)
        const found = await stat(file).catch(() => null)
        if (found?.isFile() && found.mtimeMs < limit) await unlink(file).catch(() => {})
      }
    },
  }
}

/**
 * The envelopes and collection files a data directory made before this, read once into
 * the database. The `.lekka` files are left exactly where they are, because they are
 * still the body of every card; the `.meta.json` files beside them, and the collection
 * directory entire, stop being read and can be deleted once you are happy.
 */
export async function adopt(db, directory) {
  const done = db.prepare("select value from settings where name = 'adopted'").get()
  if (done) return { cards: 0, collections: 0 }

  const counted = { cards: 0, collections: 0 }
  const add = db.prepare(
    'insert or ignore into records (kind, id, hash, owner, body, created, updated, touched) values (?, ?, ?, ?, ?, ?, ?, ?)',
  )

  for (const [kind, folder, extension] of [
    ['card', join(directory, 'cards'), '.lekka'],
    ['collection', join(directory, 'collections'), '.json'],
  ]) {
    for (const name of await readdir(folder).catch(() => [])) {
      if (!name.endsWith('.meta.json')) continue
      const id = name.slice(0, -'.meta.json'.length)
      if (!ID.test(id)) continue

      const envelope = await readFile(join(folder, name), 'utf8')
        .then(JSON.parse)
        .catch(() => null)
      if (!envelope?.key) continue

      const body =
        kind === 'collection'
          ? await readFile(join(folder, id + extension), 'utf8').catch(() => null)
          : null
      if (kind === 'collection' && body === null) continue

      add.run(
        kind,
        id,
        envelope.key,
        envelope.owner ?? null,
        body,
        envelope.created ?? new Date().toISOString(),
        envelope.updated ?? envelope.created ?? new Date().toISOString(),
        envelope.touched ?? envelope.created ?? new Date().toISOString(),
      )
      counted[kind === 'card' ? 'cards' : 'collections']++
    }
  }

  db.prepare("insert into settings (name, value) values ('adopted', ?)").run(
    new Date().toISOString(),
  )
  return counted
}

function hash(key) {
  return createHash('sha256').update(key).digest('hex')
}

function same(a, b) {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  return left.length === right.length && timingSafeEqual(left, right)
}
