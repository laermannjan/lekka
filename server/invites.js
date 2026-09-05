import { createHash } from 'node:crypto'

import { newId } from '../app/id.js'

const TOKEN_LENGTH = 22
const HOUR = 60 * 60 * 1000

/**
 * The two ways somebody new arrives at an instance that has a door.
 *
 * `device` attaches another browser to a person who is already here - the same human,
 * a second machine, and no second password. `person` makes somebody new, who picks
 * their own name and password when they open it.
 *
 * They are one table because they are one screen and one link. What differs is only
 * what redeeming does, which is why the kind is written down when the invite is made
 * rather than guessed when it is spent: whoever issues it knows which they meant.
 *
 * Single use, and short lived. Only the hash of the token is kept, so a leaked database
 * cannot be redeemed and a lost link cannot be recovered - it is reissued instead.
 */
export function openInvites(db) {
  const one = (sql) => db.prepare(sql)
  const add = one(
    'insert into invites (token, kind, person, created, expires) values (?, ?, ?, ?, ?)',
  )
  const find = one(
    `select i.token, i.kind, i.person, i.expires, p.name as who
       from invites i left join people p on p.id = i.person
      where i.token = ?`,
  )
  const drop = one('delete from invites where token = ?')
  const sweep = one('delete from invites where expires < ?')

  return {
    /** The token is returned once and never stored, only its hash. */
    make(kind, person, hours = 1) {
      sweep.run(new Date().toISOString())
      const token = newId(TOKEN_LENGTH)
      const now = new Date()
      const expires = new Date(now.getTime() + hours * HOUR).toISOString()
      add.run(hash(token), kind, person, now.toISOString(), expires)
      return { token, kind, expires }
    },

    /** What a link is for, so the screen it opens can say what it is about to do. */
    read(token) {
      if (!token) return null
      const found = find.get(hash(token))
      if (!found || found.expires <= new Date().toISOString()) return null
      return { kind: found.kind, person: found.person, who: found.who }
    },

    /** Spending one is the same act as taking it away. */
    spend(token) {
      const found = this.read(token)
      if (found) drop.run(hash(token))
      return found
    },
  }
}

function hash(token) {
  return createHash('sha256').update(token).digest('hex')
}
