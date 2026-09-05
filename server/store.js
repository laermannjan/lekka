import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { newId } from '../app/id.js'
import { inside } from './db.js'
import { cardId } from './names.js'

const DAY = 24 * 60 * 60 * 1000
const ID = /^[a-z0-9-]{1,64}$/

/**
 * Recipes. The body is a file named by its id; the id and its three dates are a row.
 * Who may touch it is not here at all - that is `grants.js`, which is the one place
 * that answers it.
 */
export function openStore(directory, db, grants) {
  const cards = join(directory, 'cards')
  const path = (id) => join(cards, `${id}.lekka`)

  const one = (sql) => db.prepare(sql)
  const find = one('select * from cards where id = ?')
  const add = one('insert into cards (id, created, updated, touched) values (?, ?, ?, ?)')
  const put = one('update cards set updated = ?, touched = ? where id = ?')
  const drop = one('delete from cards where id = ?')
  const stamp = one('update cards set touched = ? where id = ?')
  const listed = one('select id, updated from cards order by updated desc')
  const held = one('select id from cards')
  const older = one('select id from cards where touched < ?')

  const row = (id) => (ID.test(id ?? '') ? (find.get(id) ?? null) : null)

  /** A body goes to a temporary and is renamed into place, which a power cut cannot tear. */
  const write = async (id, text) => {
    const temporary = `${path(id)}.${newId(6)}`
    await writeFile(temporary, text)
    await rename(temporary, path(id))
  }

  return {
    async open() {
      await mkdir(cards, { recursive: true })
      return this
    },

    /**
     * A card and, where somebody made it, the grant that says it is theirs. Both or
     * neither: on an instance that has people, a card nobody owns is one nobody can
     * reach. The owner grant is written even under `LOGIN`, where nothing reads it yet,
     * so that turning on `GRANT` finds every card already answerable to somebody.
     */
    async create(text, label, owner = null) {
      let id = cardId(label)
      while (row(id)) id = cardId(label)

      const now = new Date().toISOString()
      await write(id, text)
      inside(db, () => {
        add.run(id, now, now, now)
        if (owner) grants.give(id, { person: owner, scope: 'owner', by: owner })
      })
      return { id }
    },

    async read(id) {
      if (!row(id)) return null
      return readFile(path(id), 'utf8').catch(() => null)
    },

    async write(id, text) {
      if (!row(id)) return false
      const now = new Date().toISOString()
      await write(id, text)
      put.run(now, now, id)
      return true
    },

    async remove(id) {
      if (ID.test(id ?? '')) await unlink(path(id)).catch(() => {})
      drop.run(id)
    },

    has(id) {
      return Boolean(row(id))
    },

    /** Every card there is, for the modes where everyone may see everything. */
    all() {
      return listed.all()
    },

    /** Reads keep a card alive, but at most one write a day. */
    async touch(id) {
      const found = row(id)
      if (!found) return
      const now = new Date()
      if (now - new Date(found.touched) < DAY) return
      stamp.run(now.toISOString(), id)
    },

    /**
     * What nobody has opened goes, and so does what an interrupted write left behind: a
     * file no row points at is unreachable, and a temporary belongs to a rename that
     * never happened.
     */
    async sweep(days) {
      const limit = Date.now() - days * DAY
      for (const { id } of older.all(new Date(limit).toISOString())) await this.remove(id)

      const kept = new Set(held.all().map((card) => card.id))
      for (const name of await readdir(cards).catch(() => [])) {
        if (name.endsWith('.lekka') && kept.has(name.slice(0, -'.lekka'.length))) continue
        const file = join(cards, name)
        const found = await stat(file).catch(() => null)
        if (found?.isFile() && found.mtimeMs < limit) await unlink(file).catch(() => {})
      }
    },
  }
}
