# How the app works

Enough to rebuild it. The card format is in `FORMAT.md`, the look and the
tree-to-table rules are in `NOTATION.md`. Both stay exactly as they are.

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

A card has two secrets, both generated when it is created:

| Link | May |
|---|---|
| `/r/<id>` | read |
| `/r/<id>/<key>` | read and write |

`id` is 10 characters, `key` is 22, from an alphabet without look-alikes
(no `0/O`, no `1/l/I`), drawn by rejection sampling so no character is more
likely than another. The server stores **only a SHA-256 of the key** and
compares in constant time.

There is no login, no session, no cookie. Consequences to keep:

- The server **cannot list cards.** Whoever has no link finds nothing. Any
  "all cards" endpoint would make the secret pointless.
- The link is the state. It stays in the address bar, so you always see what you
  hold, a bookmark keeps its rights, and reloading changes nothing.
- A secret in a path lands in browser history and proxy logs. Send
  `Referrer-Policy: no-referrer` so it does not leak outward on a click.

## Storage

One card is one file, named by its id. Get-by-id is the only access pattern, so
a directory is the database. Next to the card the file keeps its envelope: id,
key hash, created and updated timestamps. The envelope is not part of the card
format.

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

**Overview at `/`.** The list of links this browser knows, kept in
`localStorage`. It is not a list of cards on the server, because there cannot be
one. Each entry: the name links to reading, a separate link edits, plus copy and
remove. Remove drops the link, not the card.

**Card at `/r/…`.** Header with title, yield and notes. Below it a bar with
scale (½× 1× 1½× 2×), views, and the actions. Then the card.

## Look

The card itself is specified in `NOTATION.md`. Around it:

- **One frame.** The whole page is a single card on a paper-coloured ground,
  bordered 2 px in the accent colour, at most about 1140 px wide.
- **A header bar** in the accent colour: the title upper case and letter-spaced
  on the left, yield and notes in a lighter tint on the right.
- **A bar below it** on the page colour: scale on the left, views in the middle,
  actions on the right, each group labelled in small grey capitals. Switches are
  segmented buttons sharing one border, the active one filled with the accent.
- **One type size everywhere**, including buttons. Hierarchy comes from weight
  and colour only.
- **The table scrolls sideways** inside the frame, the header stays.
- **Printing** drops the bars and leaves the card.

## Editing

Only with a key in the path. Then every field in the card becomes editable in
place: title, preparation, verb, note, amount, unit, name, qualifier.

Changes are collected, not sent. A counter shows how many fields differ from the
saved card, one button saves, one discards. Live-saving every keystroke would
publish half-typed words to everyone holding the read link.

Structure - inserting a step, moving a strand - is edited as `.lekka` text in a
panel below the card. Value editing in the card, structure in the text: rewiring
is rare, typos are frequent.

Two rules learned the hard way:

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

Offline you can read every card you have opened. Writing is refused with a clear
message. The server stays the single source, so two devices on the same edit
link cannot diverge.

## Deployment

One container, `node:22-alpine`, non-root, read-only filesystem with a volume at
the data directory. It serves the app and the API on one port. TLS belongs to a
reverse proxy in front - a service worker needs a secure context, so without
HTTPS the app runs but is neither offline-capable nor installable.

## Testing

- **Pure functions** - parsing, layout, amounts, the shopping sum - as unit
  tests. The layout deserves property tests: no cell overlaps, every span is
  contiguous, every row is covered.
- **The format** round-trips: reading what was written gives the same card, and
  writing is idempotent. Check it against random trees, not only the examples.
- **The API** against a running server: rights, wrong key, missing key, another
  card's key, no listing endpoint.
- **At least the rights matrix in a real browser.** A DOM stub is not enough:
  three rounds were lost to a CSS rule that overrode `[hidden]`, where the
  property said "hidden" and the button was visible. Only a browser catches it.

## What we are not building again

| Dropped | Why |
|---|---|
| A second data format | Cards are `.lekka` files. Storing JSON as well means two formats, two parsers, two ways to be wrong. |
| A JSON Schema plus a hand-written validator | With text as the format, validation *is* parsing. |
| Ingredients as objects with extra fields | A text line cannot carry them, so they could never be edited as text. One representation. |
| Backup bundles of all cards including keys | Export one card as its file. The overview is a list of links; if it is lost, the links are lost, and that is what a backup of the data directory is for. |
| A change counter with per-field diffing | A dirty flag is enough to decide whether "save" does anything. |
| Recipes shipped inside the app | Cards are data, not code. |

## What is worth adding, in this order

1. **Duration per step** as a real field, so a schedule can be computed
   backwards from when you want to eat. For sourdough this is the point where a
   card beats paper.
2. **Step and shopping views.** Both are pure functions over the tree; the
   shopping list sums equal ingredients and shows how the amount splits up.
3. **Non-scaling amounts**, for a line like `Hefe: 1 Würfel` that should not
   double when the recipe does.
