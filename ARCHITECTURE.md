# How the app works

Enough to rebuild it. What the other documents cover:

| | |
|---|---|
| `FORMAT.md` | the card file |
| `LAYOUT.md` | how a card becomes a table |
| `STYLE.md` | colours, type, placement |
| `CONVERTING.md` | turning an ordinary recipe into a card |

All four stay exactly as they are.

## What it is

A household tool for recipe cards. One person writes a card, hands someone a
link, and both can read it on a phone in the kitchen without a signal. There are
no accounts.

Two parts, no build step:

- **A server.** Serves the files and a handful of endpoints. No runtime
  dependencies, no database, no framework.
- **A browser app.** Plain ES modules, loaded directly. No bundler, no
  transpiler, no framework.

## Rights hang on the link

Two kinds of thing are stored, and both are addressed the same way:

| Link | May |
|---|---|
| `/r/<id>` | read a card |
| `/r/<id>/<key>` | read and write it |
| `/c/<name>` | read a collection, with every key in it stripped out |
| `/c/<name>/<key>` | read and write it; opening this adopts it on the device |

A **collection is a list of card links and nothing else.** Cards do not belong to
it, so there is one permission rule for the whole system: do you hold the key for
the thing you are touching. A row that carries a key is editable and says so;
one without it is read-only.

A card's `id` is its title as a slug, then 10 random characters. A collection's
`name` is three words, then four. The slug and the words are for a human reading
a directory listing or picking a bookmark out of a list; the random part is what
makes the link unguessable. Both are lower case, because a case-blind filesystem
would otherwise merge two ids into one file.

The `key` is 22 characters. Everything random is drawn by rejection sampling from
an alphabet without look-alikes, so no character is more likely than another. The
server stores **only a SHA-256 of the key** and compares in constant time.

A collection is written from more than one device, so a read returns an `ETag`
and a write must name it with `If-Match`. A write built on a version somebody
else has replaced is refused rather than silently overwriting them. Checking the
version and writing is one move: writes to the same collection are held in a
chain, or both devices would read the same tag and both pass the check.

There is no login, no session, no cookie. Consequences to keep:

- The server **cannot list cards.** Whoever has no link finds nothing. Any
  "all cards" endpoint would make the secret pointless.
- The link is the state. It stays in the address bar, so you always see what you
  hold, a bookmark keeps its rights, and reloading changes nothing.
- A secret in a path lands in browser history and proxy logs. Send
  `Referrer-Policy: no-referrer` so it does not leak outward on a click.

## Storage

One card is one file, named by its id. Get-by-id is the only access pattern, so
a directory is the database. Next to the card lies its envelope: the key hash,
and when it was created, changed and last read. The envelope is not part of the
card format.

```
data/cards/dinkelquarkbrot-7kmq2rxvbn.lekka
data/cards/dinkelquarkbrot-7kmq2rxvbn.meta.json
data/collections/purely-mellow-rhubarb-cypk.json
```

Collections are the same shelf with a different extension, so key hashing,
atomic writes and expiry are written once and serve both.

Every write goes to a temporary file and is renamed into place, which is atomic:
a power cut leaves the old card or the new one, never half of either. Reading a
record refreshes its `touched` stamp, at most once a day, so that an optional
`TTL_DAYS` sweep can delete what nobody has opened without ever deleting what is
in use. Unset, nothing is ever swept. The sweep also reaps what an interrupted
write left behind - a body with no envelope, a temporary whose rename never
happened - since nothing can reach either.

There is no state anywhere else. A server started against an existing data
directory is immediately serving every link in it.

The directory is the only copy. It must be a volume, and it must be backed up.

## The pipeline

```
.lekka text  ──parse──▶  tree  ──layout──▶  grid  ──render──▶  DOM
                          │                   │
                          └── the card         └── rows, cells, columns
```

Four steps, each a pure function except the last. The essential piece is that
**layout also returns, for every row and every cell, where it came from in the
tree**. Without that back-reference the card can be drawn but not edited: the
editor changes a cell on screen and has to write it into the right node.

## Screens

**Overview at `/`.** The collection this browser holds, which it remembers in
`localStorage` as a link, not as a list. The rows come from the server, because a
collection is a thing on the server; what is local is only which collection you
are using and a copy of what was in it, so the list still opens with no network.

It is not a list of cards on the server, because there cannot be one. Each row:
the name links to reading, a badge says whether you can edit it, `Remove` drops
the link, `Delete` drops the card for everyone who holds one.

`Link for another device` opens a dialog: the full link written out, a copy
button, and the same link as a QR code to scan with a phone. It was once an
anchor to `/c/<name>/<key>`, which on the device that already holds the
collection meant adopting what it had, replacing the address with `/`, and
landing back on the overview - a flash, and nothing said. Nothing navigates now,
so the address bar stays at `/`, which is where the key belongs to stay: out of
the address bar, out of history, out of a screen share.

The code is drawn by `app/qr.js`, some four hundred lines, no dependency. The
app has no build step and a policy that loads nothing from elsewhere, so the
alternative was a minified blob in `app/` that no one reads. Byte mode, error
correction M, versions 1 to 10, which is 213 bytes of UTF-8 - longer than that
is not a link one shares.

Holding no collection, the overview offers to make one. Opening `/c/<name>`
without its key shows somebody else's list and does **not** adopt it, since a
device that cannot write to a collection has no business calling it its own.

**Writing at `/new`.** A textarea holding a card as text. It parses before it
sends, so a card that cannot be drawn is never stored.

**Card at `/r/…`.** Header with title, yield and notes. Below it a bar with
scale (½× 1× 1½× 2×), the actions, and `Save to collection` when the card is not
in yours yet. Then the card.

## Editing

Only with a key in the path.

Structure - inserting a step, moving a strand - is edited as `.lekka` text in a
panel below the card, which is what exists today. It parses before it saves, and
the card above redraws while the panel stays open. Because indenting a strand by
hand is the tedious part, the panel knows three things: tab and shift-tab move
the selected lines, enter keeps the current indentation, and **wrap in step**
takes the line under the cursor together with everything indented below it,
which is exactly one subtree, and hangs it under a new step.

**Still to build:** every field editable in place - title, preparation, verb,
note, amount, unit, name, qualifier. Value editing in the card, structure in the
text: rewiring is rare, typos are frequent.

Changes will be collected, not sent. A dirty flag decides whether saving does
anything. Live-saving every keystroke would publish half-typed words to everyone
holding the read link.

Two rules learned the hard way, which apply when that lands:

- After leaving a field, refresh **only that field** from the model. Redrawing
  the card replaces the element being clicked next, and the following keystroke
  is lost.
- Amounts are shown scaled. A number typed at 2× means the doubled amount; store
  it divided.

## Offline

A service worker, network-first for everything: online the server always wins,
the cache is only the fallback. Cache-first would serve a stale app for days
without any sign of it.

Its cache version is a hash of the app directory, computed by the server when it
serves the worker. Changed file, new version; unchanged file, same version and
the cache survives. Never a hand-maintained number.

Offline you can read every card you have opened, because each one is kept in
`localStorage` as it is fetched. Writing fails, and the overview says so. The
server stays the single source, so two devices on the same edit link cannot
diverge.

Collection responses are never cached by the worker: the same URL answers
differently depending on whether a key was sent, and a cached public copy with
the keys stripped must never be handed back to a device that holds them.

## Deployment

One container, `node:22-alpine`, read-only filesystem with a volume at the data
directory. It serves the app and the API on one port, and there is nothing else
to run.

The entrypoint is root only long enough to hand the data directory to the user
the server will run as, `PUID`/`PGID`, and skips even that when the directory
already belongs to them. Then it drops privileges and `exec`s the server, which
is therefore PID 1 and shuts down cleanly on `SIGTERM`. This is what lets any
mount work with no setup while the server itself never runs as root.

The app never knows its own address: every request it makes is a root-relative
path on its own origin. Put it behind any proxy under any name and nothing needs
configuring.

TLS belongs to that proxy - a service worker needs a secure context, so over
plain HTTP the app runs but is neither offline-capable nor installable. On a
private network a VPN with real certificates, such as Tailscale, is the least
work.

## Testing

- **Pure functions** - parsing, layout, amounts, the shopping sum - as unit
  tests. The layout deserves property tests: no cell overlaps, every span is
  contiguous, every row is covered.
- **The format** round-trips: reading what was written gives the same card, and
  writing is idempotent. Check it against random trees, not only the examples.
- **The API** against a running server: rights, wrong key, missing key, another
  card's key, no listing endpoint.
- **The QR code against a scanner, once.** A code is either right or unreadable,
  and reading it back with the same code that wrote it proves nothing. So every
  length from 1 to 213 was drawn and read by a real decoder (`zxing`) while the
  encoder was written, and `test/qr.test.js` keeps four of those matrices by
  hash. If a change moves a single module, the hashes say so; if the hashes are
  ever updated, they must be re-read by a scanner first.
- **No browser tests, for now.** Three rounds were once lost to a CSS rule that
  overrode `[hidden]`, where the property said "hidden" and the button was
  visible, so a DOM stub would have passed. This app answers that by building
  no element it does not mean: no key, no *Edit source* button; no key on a row,
  no *Delete*. What is absent cannot be shown by a stylesheet. The one thing
  still toggled with `hidden` is the save-error line, and `[hidden]` carries an
  `!important` in `style.css` to hold it down.

  Note what this does **not** buy: rights are enforced by the server and tested
  there. A missing button is not a permission. The browser would only tell us
  whether the app offers what the server would refuse.

  Once the UI grows past hiding a single line - in-place editing of cells is the
  next thing that would do it - end-to-end tests in a real browser become worth
  their weight, and the rights table above is what they should walk: each of the
  four link shapes, and what is actually visible under it.

## Threat model

**The server is meant for a network you already trust**: a LAN, or a VPN such as
Tailscale or Wireguard. It is not meant to be reachable from the internet, and
nothing in it is built for that. There is no admin interface, no rate limiting,
no account and no login, and those absences are deliberate.

What follows from that:

- Everyone who can reach the port can create cards. On a household network that
  is the household. `CREATE_TOKEN` narrows it if you want, but it is an extra,
  not a defence.
- The link is still the only way to a card, because a link is how you hand a
  recipe to someone, not because we expect the network to be hostile.
- The operator has the data directory. That is the administration interface:
  `ls`, `cat`, `rm`, and a backup. Building a second one over HTTP would only
  add a way in.

Still worth getting right on a trusted network, because these are bugs rather
than attacks:

- **Anything that becomes a path.** A card id is a file name, so every id, name
  and slug must be rebuilt from an allow-list, never cleaned by removing what
  looks dangerous. A link you were sent is untrusted input even at home.
- **Limits.** A body-size cap, so one bad request cannot fill the disk.
- **Writes that cannot tear.** Temp file plus rename, so a power cut leaves the
  old card or the new one.
- **The key never in a log**, an error message or a referrer, since a link
  shared inside the house is still a link that leaves it.

**Before it is ever exposed to the internet**, this is not enough. It would then
need at least: a deliberate penetration test, rate limiting on creation and on
key guessing, a hard look at whether a wrong key and a missing card are truly
indistinguishable, request and header size limits, a container review, and
proof that no route enumerates anything. None of that has been done, and the
software should not be put on a public address until it has.

Having no dependencies means no supply chain to audit. It also means every one
of these is our own bug to find.

## What we are not building again

| Dropped | Why |
|---|---|
| A second data format | Cards are `.lekka` files. Storing JSON as well means two formats, two parsers, two ways to be wrong. |
| A JSON Schema plus a hand-written validator | With text as the format, validation *is* parsing. |
| Ingredients as objects with extra fields | A text line cannot carry them, so they could never be edited as text. One representation. |
| Backup bundles of all cards including keys | Export one card as its file. The overview is a list of links; if it is lost, the links are lost, and that is what a backup of the data directory is for. |
| A change counter with per-field diffing | A dirty flag is enough to decide whether "save" does anything. |
| Recipes shipped inside the app | Cards are data, not code. The sample cards live in the tests, where they are fixtures. |
| Accounts, sessions, cookies | A collection link does what an account would, with nothing to reset and nothing to forget. |
| An admin interface over the cards | The operator has the data directory; `ls`, `cat` and `rm` need no code and cannot be reached from the network. Reading other people's recipes is not a feature. |
| A card belonging to a collection | Ownership would mean the server must know who holds what. A collection holds links, so the only question is ever whether you hold a key. |
| A database | Get by id is the only access pattern, and rename is already atomic. A directory of text files can be grepped, diffed, rsynced and restored by hand. |

## What is worth adding, in this order

1. **Duration per step** as a real field, so a schedule can be computed
   backwards from when you want to eat. For sourdough this is the point where a
   card beats paper.
2. **Step and shopping views.** Both are pure functions over the tree; the
   shopping list sums equal ingredients and shows how the amount splits up.
3. **Non-scaling amounts**, for a line like `Hefe: 1 Würfel` that should not
   double when the recipe does.
