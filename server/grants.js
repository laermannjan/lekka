import { createHash } from 'node:crypto'

import { newId } from '../app/id.js'

const TOKEN_LENGTH = 22
const HOUR = 60 * 60 * 1000

/** What each scope carries. Owning a card is editing it, plus being answerable for it. */
const CARRIES = { owner: ['owner', 'edit', 'read'], edit: ['edit', 'read'], read: ['read'] }

/**
 * Who may do what to which card. One row per permission, so every one of them can be
 * named, dated and taken back on its own - which a single secret per card never could.
 *
 * A subject is a person, who signs in as themselves, or a link, which is whoever holds
 * the token. The first survives the URL being forwarded; the second is the URL.
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
  /* A panel says who holds what, so a person grant carries their name. A link grant
   * carries none - the token is the subject, and it is never shown again after minting. */
  const onCard = one(
    `select g.id, g.kind, g.scope, g.created, g.expires, g.used, p.name as who
       from grants g left join people p on g.kind = 'person' and p.id = g.subject
      where g.card = ? order by g.created`,
  )
  const byId = one('select id, card, kind, scope from grants where id = ?')
  const forPerson = one(
    `select g.card as id, g.scope, c.updated from grants g join cards c on c.id = g.card
      where g.kind = 'person' and g.subject = ?
        and (g.expires is null or g.expires > ?)
      order by c.updated desc`,
  )
  const drop = one('delete from grants where id = ?')
  const spend = one('update grants set used = ? where id = ?')

  const live = (row, now) => Boolean(row) && (!row.expires || row.expires > now)

  return {
    /** The token is returned once for a link grant and never stored, only its hash. */
    give(card, { person = null, scope = 'read', by = null, expires = null } = {}) {
      const now = new Date().toISOString()
      const id = newId()
      if (person) {
        add.run(id, card, 'person', person, scope, by, now, expires)
        return { id, kind: 'person', scope, expires }
      }
      const token = newId(TOKEN_LENGTH)
      add.run(id, card, 'link', hash(token), scope, by, now, expires)
      return { id, kind: 'link', token, scope, expires }
    },

    /**
     * Whether this asker may do this to this card. A person's own grant is tried first,
     * then whatever token they presented, so a signed-in owner never needs a link.
     */
    may(card, { person = null, token = null } = {}, need = 'read') {
      const now = new Date().toISOString()
      for (const [kind, subject] of [
        ['person', person],
        ['link', token ? hash(token) : null],
      ]) {
        if (!subject) continue
        const found = forSubject.get(card, kind, subject)
        if (live(found, now) && CARRIES[found.scope]?.includes(need)) {
          // Last-used is worth a write an hour, not a write a request: it is there so a
          // share panel can say whether a link is still in use, not to count reads.
          if (!found.used || Date.now() - new Date(found.used).getTime() > HOUR)
            spend.run(now, found.id)
          return true
        }
      }
      return false
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

    revoke(id) {
      return drop.run(id).changes > 0
    },
  }
}

function hash(token) {
  return createHash('sha256').update(token).digest('hex')
}
