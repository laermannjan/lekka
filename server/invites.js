import { createHash } from 'node:crypto'

import { newId } from '../app/id.js'

const TOKEN_LENGTH = 22
const HOUR = 60 * 60 * 1000

/**
 * How somebody new arrives at an instance that has a door: a link, made by whoever is
 * already inside, which the person opening it turns into an account of their own.
 *
 * There is nothing here for a second browser of your own, because signing in is that
 * already - a name and a password you have.
 *
 * Single use, and short lived. Only the hash of the token is kept, so a leaked database
 * cannot be redeemed and a lost link cannot be recovered - it is reissued instead.
 */
export function openInvites(db) {
  const one = (sql) => db.prepare(sql)
  const add = one('insert into invites (token, person, created, expires) values (?, ?, ?, ?)')
  const find = one(
    `select i.token, i.person, i.expires, p.name as who
       from invites i left join people p on p.id = i.person
      where i.token = ?`,
  )
  const drop = one('delete from invites where token = ?')
  const sweep = one('delete from invites where expires < ?')

  return {
    /** The token is returned once and never stored, only its hash. */
    make(person, hours = 1) {
      sweep.run(new Date().toISOString())
      const token = newId(TOKEN_LENGTH)
      const now = new Date()
      const expires = new Date(now.getTime() + hours * HOUR).toISOString()
      add.run(hash(token), person, now.toISOString(), expires)
      return { token, expires }
    },

    /** What a link is for, so the screen it opens can say what it is about to do. */
    read(token) {
      if (!token) return null
      const found = find.get(hash(token))
      if (!found || found.expires <= new Date().toISOString()) return null
      return { person: found.person, who: found.who }
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
