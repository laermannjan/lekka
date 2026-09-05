import { DatabaseSync } from 'node:sqlite'

/**
 * One database for everything that is not a recipe.
 *
 * A card stays a `.lekka` file, because "one recipe is one file you can grep, diff,
 * rsync and restore by hand" is the property this project is built on. What surrounds a
 * card is small, numerous, and read by more than one column, which is the shape a
 * directory is bad at.
 *
 * A card is an id and three dates. Every question about who may touch it - ownership
 * included - is one lookup in `grants`, so there is one mechanism rather than a column
 * for the owner and a table for everybody else.
 */
const SCHEMA = `
create table if not exists cards (
  id      text primary key,
  created text not null,
  updated text not null,
  touched text not null
);

create table if not exists grants (
  id        text primary key,
  card      text not null references cards(id) on delete cascade,
  kind      text not null,
  subject   text not null,
  scope     text not null,
  issued_by text,
  created   text not null,
  expires   text,
  used      text
);

/* A card has one owner or none, never two. A subject is named once per card, so
 * granting again changes what they hold rather than stacking a second row. */

/* The first person to arrive keeps the instance: they are the one who can see everybody
 * and remove somebody. It is a flag rather than a role table, because there are two
 * kinds of person here and there is no third one coming. */
create table if not exists people (
  id      text primary key,
  name    text not null,
  admin   integer not null default 0,
  created text not null
);

/* At most one, enforced here rather than trusted to the code that writes it: the index
 * covers only the rows that are the operator, so a second one cannot be inserted. */

create table if not exists credentials (
  kind   text not null,
  handle text not null,
  person text not null references people(id) on delete cascade,
  secret text not null,
  primary key (kind, handle)
);

create table if not exists sessions (
  id      text primary key,
  token   text not null unique,
  person  text not null references people(id) on delete cascade,
  label   text not null,
  created text not null,
  seen    text not null
);

/* How somebody new arrives, made by whoever is already inside. Single use and short
 * lived, so the table is small and mostly empty. */
create table if not exists invites (
  token   text primary key,
  person  text references people(id) on delete cascade,
  created text not null,
  expires text not null
);
`

/*
 * The indexes, apart from the tables, because one of them stands on a column that a
 * data directory written before it does not have yet. Tables first, then the columns
 * they are missing, then these.
 */
const INDEXES = `
create unique index if not exists people_operator on people (admin) where admin = 1;
create unique index if not exists grants_owner on grants (card) where scope = 'owner';
create unique index if not exists grants_once on grants (card, kind, subject);
create index if not exists grants_subject on grants (kind, subject);
create index if not exists sessions_person on sessions (person);
create index if not exists cards_touched on cards (touched);
`

/*
 * `create table if not exists` does nothing at all to a table that is already there, so
 * a column added to this file later never appears in a data directory that predates it.
 * Every change the schema has needed so far has been a column with a default, which can
 * simply be added where it is missing. Anything that has to *move* data rather than make
 * room for it will need a version written into the file; this is deliberately not that.
 */
const COLUMNS = [['people', 'admin', 'integer not null default 0']]

export function openDb(file) {
  const db = new DatabaseSync(file)
  db.exec('pragma journal_mode = wal')
  db.exec('pragma foreign_keys = on')
  db.exec(SCHEMA)

  for (const [table, column, type] of COLUMNS) {
    const held = db.prepare(`pragma table_info(${table})`).all()
    if (held.length > 0 && !held.some((one) => one.name === column))
      db.exec(`alter table ${table} add column ${column} ${type}`)
  }

  db.exec(INDEXES)

  /* People who arrived before there was such a thing as keeping the instance have the
   * column now and nobody in it. Whoever got here first takes it, which is the rule that
   * would have applied had it existed at the time. */
  const people = db.prepare('select count(*) as n from people').get().n
  const operator = db.prepare('select count(*) as n from people where admin = 1').get().n
  if (people > 0 && operator === 0)
    db.exec('update people set admin = 1 where id = (select id from people order by created limit 1)')

  return db
}

/** A short run of work that either all happens or none of it does. */
export function inside(db, work) {
  db.exec('begin immediate')
  try {
    const answer = work()
    db.exec('commit')
    return answer
  } catch (error) {
    db.exec('rollback')
    throw error
  }
}
