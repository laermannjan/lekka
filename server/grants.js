import { newId } from '../app/id.js'
import { inside } from './db.js'

const HOUR = 60 * 60 * 1000

/** What each scope carries. Owning a card is editing it, plus being answerable for it. */
const CARRIES = { owner: ['owner', 'edit', 'read'], edit: ['edit', 'read'], read: ['read'] }

/**
 * Who may do what to which card. One row per permission, so every one of them can be
 * named, dated and taken back on its own - which a single secret per card never could.
 *
 * A subject is always a person, who signs in as themselves - so a grant survives the URL
 * being forwarded, and taking it back from one of them takes it back from one of them.
 * There is no way to hand a recipe to somebody with no account here, which is deliberate:
 * `kind` is kept on the row because one existed once and may again, and because dropping
 * a column needs a migration this project has decided not to have yet. Every row says
 * `person`.
 */
export function openGrants(db) {
  const one = (sql) => db.prepare(sql)

  const add = one(
    `insert into grants (id, card, kind, subject, scope, issued_by, created, expires)
     values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict (card, kind, subject) do update set
       scope = excluded.scope, expires = excluded.expires, created = excluded.created`,
  )
  const forSubject = one(
    'select * from grants where card = ? and kind = ? and subject = ?',
  )
  /* A panel says who holds what, and everybody who holds anything has a name. */
  const onCard = one(
    `select g.id, g.scope, g.created, g.expires, g.used, p.name as who
       from grants g join people p on p.id = g.subject
      where g.card = ? order by g.created`,
  )
  const byId = one('select id, card, scope from grants where id = ?')
  const forPerson = one(
    `select g.card as id, g.scope, c.updated from grants g join cards c on c.id = g.card
      where g.kind = 'person' and g.subject = ?
        and (g.expires is null or g.expires > ?)
      order by c.updated desc`,
  )
  const drop = one('delete from grants where id = ?')
  const stamp = one('update grants set used = ? where id = ?')

  const live = (row, now) => Boolean(row) && (!row.expires || row.expires > now)

  return {
    give(card, { person, scope = 'read', by = null, expires = null }) {
      const now = new Date().toISOString()
      const id = newId()
      add.run(id, card, 'person', person, scope, by, now, expires)
      return { id, scope, expires }
    },

    /** Whether this person may do this to this card. */
    may(card, { person = null } = {}, need = 'read') {
      if (!person) return false
      const now = new Date().toISOString()
      const found = forSubject.get(card, 'person', person)
      if (!live(found, now) || !CARRIES[found.scope]?.includes(need)) return false
      // Last-used is worth a write an hour, not a write a request: it is there so a
      // panel can say whether a grant is still in use, not to count reads.
      if (!found.used || Date.now() - new Date(found.used).getTime() > HOUR)
        stamp.run(now, found.id)
      return true
    },

    /** Every grant on a card, for the panel that says who holds what. */
    on(card) {
      return onCard.all(card)
    },

    /** One grant, so a route can ask whose card it is before taking it back. */
    find(id) {
      return byId.get(id) ?? null
    },

    /** The cards a person holds any live grant on, most recently changed first. */
    cards(person) {
      return person ? forPerson.all(person, new Date().toISOString()) : []
    },

    /**
     * Every recipe nobody owns, handed to one person. Only ever called once, when the
     * first person arrives on an instance whose recipes were made before there was
     * anybody to own them.
     */
    adopt(person) {
      const now = new Date().toISOString()
      const orphans = db
        .prepare("select id from cards where id not in (select card from grants where scope = 'owner')")
        .all()
      inside(db, () => {
        for (const card of orphans)
          add.run(newId(), card.id, 'person', person, 'owner', person, now, null)
      })
      return orphans.length
    },

    revoke(id) {
      return drop.run(id).changes > 0
    },
  }
}
