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

It is not a list of cards on the server, because there cannot be one. It is a
table of three columns: the name, which links to reading, and the two acts that
are not the same act - `Remove` drops the link, `Delete` drops the card for
everyone who holds one, so only the second needs a key. The last row is where
the table grows: `Import` for a recipe that exists somewhere already, `Create`
for one that does not.

The collection's own name is stamped into the masthead, beside the app's. A
person holds one collection, so it belongs to the app rather than to a screen and
is said once. It is also the way to the code that carries the collection onto
another device, so it is drawn as a control and says so before it is pressed.

That stamp opens a dialog: the full link written out, a copy
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

**Writing at `/new`.** The editor on an empty draft, with the name field waiting.
Nothing is sent until the first save: a recipe nobody finished writing never
reaches the server at all.

**Card at `/r/…`.** The name, then the table, and the specification under it.

Controls are sorted by what each one touches, which is the rule that says where
anything goes. The scale (½× 1× 1½× 2×) and `Fit to screen` change how the recipe
is drawn, so they sit above the table, beside what they change. `Edit` and `Save
to collection` change the recipe itself, so they sit below it, out of the way of
reading.

`Fit to screen` is the second answer to a table wider than the screen. Reading it
a step at a time keeps the type and gives up seeing it all; fitting shrinks the
table with `zoom` until it is inside the room it has, keeps the whole card and
gives up the type. The two are exclusive, so fitting turns the places and the
snapping off - there is nowhere left to scroll to - and the button is not offered
at all on a recipe that already fits.

The **specification** is what the app knows about the recipe that the recipe does
not say in one place: how long it takes end to end, what the dough weighs, what
it yields, its notes. The time is scattered across a dozen step verbs and the
weight is a sum nobody wants to do at the counter, so `app/facts.js` does both.
Only a step's verb is read for a duration - a note holds asides like "rotate
every 20 min" and second opinions like "gesamt 70-80 min", and counting those
either doubles a step or invents work that is not a step - and a range is taken
at its upper bound. A row with no answer for this recipe is left out rather than
filled with a dash: ribs are measured in racks and cups, and a weight of nothing
is noise.

There is one view, because there is one card. `STYLE.md` already says what to do
about a table wider than the screen, and that rule is the interface: **a card
that fits is drawn whole, however large the screen; only one that does not gains
the reading affordances.** So they are not a phone mode. They appear exactly when
there is somewhere to go, and dissolve when there is not.

What a card that does not fit gains is **a cell held at the left edge**. Every
cell sits in a slot running from its own column to the step that takes it, and
sticks for that whole run, so what stands at the edge is always the last thing
that happened to those rows: the ingredients until something takes them, then the
step that took them, then the step after that. The counter is the table held
still, not a second column kept in step with it - once the dough is mixed and
risen, its flour and water are not things the cook handles any more, `reifen 12 h`
is.

Two properties make it work, and both come from the table rather than from the
view. A step covers exactly the rows of its own subtree, so it can take those rows
over in place and nothing moves up or down. And right alignment (`LAYOUT.md`) puts
every step a step feeds on at the column before it, so a step's slot is always one
column wide and only an ingredient ever waits.

Above the card, three places name where things are on the screen rather than which
column they are: `Done`, `Now`, `Next`. They are fixed to the screen and never
scroll. `Done` is as wide as the widest column while an ingredient may still be
standing in it, and no wider than the step itself after that; everything in it is
flush with its right edge, so a narrow step rests against the `Done` line with the
column before it sliding out to its left. Dragging scrolls and settles on the
nearest of those lines; a flick is worth exactly one step however far it
travelled.

## Editing

Only with a key in the path, and one way in.

**The editor** is where a recipe is written. `Edit` opens it, and `Create` starts
in it on an empty draft. It draws the whole screen and not only the table,
because everything a person wrote is opened at once: the name above the table,
and the yield, the notes and the preparations as fields in the specification
below it. There is no separate form for the recipe itself, and so no second place
where its name can be changed.

`Save` and `Cancel` sit under the table, where `Edit` stood a moment ago, so the
button that leaves writing is in the place the button that entered it was.

**Nothing is written in the table.** A tap on a row or on a step opens the form,
which is a layer over the page; the table itself is the table it is read as, to
the pixel - same columns, same rows, same cells, not one field in it - and the
only thing that ever differs is colour.

That is the third arrangement and the first robust one. Dialogs came first and
were taken out, because a dialog covers the table you are writing against. Cells
opening where they stood replaced them, and a field is not the words it replaces:
it has a border and a padding they do not, so it wraps at a different width. On
`roggenquarkbrot`, opening `backen` left every column and every row exactly where
it was and moved the words *inside that one cell* by 13px, 2px narrower and 16px
shorter. Small, and at the precise point the eye was on. A column of tick boxes
that came and went beside it moved the rest.

So the dialog came back, built properly this time: docked to the foot of the
window rather than centred, so the head of the table stays above it, and as tall
as it needs to be. That last part is what a layer buys over a panel in the page.
A panel has to fit the room left over, and how much room is left over depends on
how long the recipe is - measured at 500px wide, a console under the table sat at
y=290 for a thirteen-row card and would walk off the bottom of a phone for a
longer one. A layer is in the same place whatever the recipe does. `tools/check.mjs`
holds the whole claim down: it reads `grid-template-columns` and
`grid-template-rows` before a cell is touched and after it is opened, typed into
and applied, and fails if a single track moved.

The form is modal and the page behind it is dimmed. The cost is real and was
chosen: the table is dimmed, not hidden - the form is 640px at the foot of a
wider window - so the shading still reads, and the list of inputs also says on
its own what each one brings.

**The table says two things, in two colours.** Blue rings the one row or step the
form is open on; amber shades what goes into it. A cell can be both, so the ring
is a ring and not a fill.

**A row is painted whole.** A row reaches as far as the step that takes it, so
`250 g Mehl` waiting through two columns is one row six columns wide with fields
in the first three and blank after. Painted through its cells only, the blank
part - which is exactly the part that says it is still waiting - stayed white,
and shading a step lit an L with its corner missing. Free area is drawn over that
blank to carry the rules where two runs of it meet at different widths; it is ink
and nothing else, with no fill and no target, so a tap there reaches the row.

`+ Ingredient` sits under the last ingredient, always in the same place, because
a button that moves about is a button nobody finds twice. It adds an empty row
and opens the form on it; there is no form to fill in first.

**A preparation belongs to a step, and is drawn over that step's column**, above
the line that names the column, because that is when it happens. It is a field of
that step's form when it is written. One belonging to the recipe is the same
thing said about the first step there is, so it stands over the ingredient block,
which is what comes before every column there is - and that is the whole of the
model: there is no second kind of preparation, only one whose step is the card.

The column is worked out by `buildBand` when the table is drawn, and never
stored. This arrangement was dropped once on the grounds that a band over a
column says the preparation belongs to the column, and a column is
`max(column(input)) + 1` - insert a step upstream and every column after it
moves, so the preparation would silently move to a different moment. That
objection was about a *stored* column. A derived one moves with its step, which
is exactly right, and the drawing is correct at every moment in between.

What it cost: a preparation belonging to the recipe used to span the table with
its words pinned to the visible part, so they stayed where the eye was however
far the table had scrolled. Standing in the ingredient block it scrolls away with
that block. `--room` and the resize watch that measured it are gone with it.

**A step is built by ticking boxes, and a box stands for an input.** A step takes
whole strands, so unticking one row of a strand it swallowed is not a move the
format has - what goes into `vermengen` is `abkühlen`, not the Roggenschrot three
steps inside it. The set offered is exactly `candidates`: the step's own inputs
plus whatever is still loose. A ticked strand is shaded whole - the input, every
step between it and the rows, and the rows - because a strand goes in whole. The
step being written stays unshaded: the shading says what is coming in.

The boxes are in the form. That is also what let the table keep the same number
of columns while a recipe is being written as while it is read: they used to
stand in a column of their own, which had to be drawn empty for the whole session
so that opening a step would not shift the table sideways under the hand.

Each box says what it brings, where that is worth saying. A step brings
everything under it and how much cannot be seen from its name, so it says
`4 ingredients`; an ingredient brings its own one row, and a list that said so on
every line would be a column of the word `row`.

**Nothing moves until `Apply`.** Typing writes nothing and ticking writes
nothing. A row that leaves a step becomes a strand of its own and is drawn
somewhere else, and a table that rearranges itself under every keystroke is no
way to decide anything.

`+ Step` makes an unnamed step, opens the form on it, and guesses what it takes:
every ingredient still waiting, or - when none is waiting - the ends of the
strands, which is how two of them are joined.

One thing this costs: a strand already inside a step cannot be handed to another
one, because it is neither a root nor an input of the step being written, so it is
offered no box. Deleting the step that holds it frees it first. `upheaval` still
guards that move in `edit.js`, and its tests are there.

What the ticked rows come to is asked of the step's *candidates* - its own inputs
plus whatever is still loose outside it - and not of `claim`, which answers "what
holds these rows" and would climb past the step being edited: from inside a step,
every row of it is also every row of the step above.

Everything that comes and goes - the faults, the messages - is drawn below the
row of buttons. One appearing above the table pushes the table down under the
hand that is working in it.

A row that belongs to no candidate is refused by name rather than dropped.

The editor's one dialog is `app/form.js`. It builds the form and nothing else:
the fields of one row or one step, the boxes of what a step may take, and three
buttons. It decides nothing - `edit.js` still answers every question about what
may go into what - and it never touches the draft, it hands back what it was
told and `Apply` is where that lands.

What a row *means* is not the ingredient on it. It is whatever currently holds
that ingredient - the rightmost cell in the row, which by right alignment is the
root of its strand. So the rule is one walk: **take the outermost node whose
rows are all chosen.** Choose every row under `verrühren` and you have said
`verrühren`; choose two of its three and you have said those two ingredients,
which then have to come out of it. Choose every row of two strands and you have
said both roots, which is how strands are joined.

The second half of that move is the half nobody pointed at, so it is said before
it happens: *"250 g Mehl comes out of verrühren"*. And a step left holding
nothing is not a shape the format has
(`FORMAT.md` rule 5), so it goes with what was taken out of it, and that is
said too. The same cascade runs when an ingredient is deleted.

**A card is the case where that array holds one root**, and that is what makes
the errors sayable. Every ingredient must end in a step, so a loose ingredient
is a root and is named as unused. All the strands must meet, so two step roots
are a card that is two recipes sharing a title - *"kochen and braten never
meet"* - and the fix is a step that takes both. Rice and chicken filets are one
card with a final `anrichten`, not two endings: `FORMAT.md` has one outermost
line and stays that way.

The screen is that model drawn, as **one table, always**. Not one per strand:
they share the ingredient column, and a strand nobody has joined yet is not a
different kind of thing needing a drawing of its own - it is some cells further
left, with free area after them. An ingredient nobody has used is a row with
nothing at all to its right, which is exactly what it is. `buildForest` places
every root on the same last column, because right alignment (`LAYOUT.md`)
already moves a short strand up against the merge; here the merge is not
written yet, so they align to where it will be, and writing it later moves
nothing.

Each fault is a line that leads to the node it is about. `Save` is off while
any fault stands.

Tapping a step edits it, which needs the back-reference layout keeps: `renderGrid`
takes an `edit` object and hands back the node a cell was drawn from, so the
editor never works out from a position in the DOM what was clicked. The same
object carries the row fields the other way - `onField` when one is committed,
`onDrawn` so a fault can put the caret in the row it is about.

The editor's table is the reading table with one column added, for `+ Step`. Only
the editor has one, so only the editor carries the `choosing` class that puts the
track there; everywhere else the arithmetic is what it always was, and the recipe
is drawn by the same code either way. A count is deliberately not used for this:
`repeat(0, …)` is not a valid track list, so a browser throws the whole template
away and draws every element in the wrong place.

**Punctuation is structure.** A colon splits an ingredient line and brackets are
the aside, so neither may sit inside a name, a verb or a note. This is checked
as a fault while it is typed, not on save, because `Salz: grob` would be written
and read back as the same text while meaning salt in an amount of "grob" - no
round trip can catch that, only knowing what the punctuation means. Saving still
formats, re-parses and compares the card structurally as a backstop, and fails
shut.

**Text comes in through `Import`** rather than through an editor of its own.
There was a second editor - a textarea holding the card as text, with tab to
indent and a wrap-in-step button - and it was two ways of doing one job, each
with its own bar, its own save and its own idea of what a card is. Pasting a
recipe in is the part of it worth keeping, so that is what stayed: the text
parses before it is sent, and one that cannot be drawn is never stored.

Changes are collected, not sent: a dirty flag decides whether saving does
anything, and leaving with one set asks first. Live-saving every keystroke would
publish half-typed words to everyone holding the read link.

Two hazards, one of which is now designed out:

- The editor **repaints itself** and never rebuilds the screen from the link.
  Every other screen does rebuild, which here would re-read the card from the
  server and throw the draft away.
- **The editor always draws at 1×.** Amounts elsewhere are shown scaled, and a
  number typed at 2× would mean the doubled amount and have to be stored
  divided. Editing at one scale removes the question rather than answering it.

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
- **The editing rules as pure functions.** `edit.js` holds every rule about what
  may be joined to what and what is wrong with a draft, and holds no DOM, so it
  is tested as arithmetic: the candidates are the roots, taking one hides it,
  editing a step sees its own inputs and never the strand it sits in.

- **The editor's wiring, against a stub DOM** (`test/dom.js`, ~140 lines). It
  walks what a person does - enter two ingredients, join them in a step, tap a
  row, tick a box, delete an input - and checks what the table then says, what
  the form offers and what the save would write. A stub proves none of that is
  *visible*; it proves the right node reached the right field, which is where the
  rules live.

- **A picture, from `node tools/shot.mjs`.** It serves the app, draws the card
  view and the editor into one page, and screenshots it with
  headless Chrome. Not an assertion - something to look at. It exists because
  the stub answers for what is *there* and nothing answers for what the
  stylesheet does to it: `repeat(0, 32px)` is not a track list, so
  `grid-template-columns` fell back to `none` and the card was drawn with every
  element present and every column the wrong width. Two of these side by side
  is what caught it.

- **Twenty-one checks in a real browser, from `node tools/check.mjs`.** Same
  machinery as the picture - own server, headless Chrome - but it drives the
  editor and reports `PASS`/`FAIL` per line, and exits non-zero.

  It exists because the stub has no layout and no caret. The claim the whole
  editor rests on - that the table does not move while a recipe is written in it
  - is a claim about `grid-template-columns`, which a stub does not compute, so
  the checks read the tracks before a cell is touched and after it is opened,
  typed into and applied, and fail if one moved. The same for what `zoom` does to
  the width a band is centred in, and for whether a rectangle drawn only to carry
  a rule is swallowing the taps aimed at the row beneath it.

  So the rule is not "no browser tests". It is: assert in `node --test` whatever
  can be asserted about what the app *builds*, and keep the browser for the three
  things only a browser has - the caret, the cascade, and layout.

  What neither buys: rights are enforced by the server and tested there. A missing
  button is not a permission. The browser would only tell us whether the app
  offers what the server would refuse.

  What the stub still cannot reach is the sheet: `dialog.showModal` taking the
  focus, keeping it inside, and closing on escape are behaviours of a real
  browser, and they are the reason a `dialog` was used instead of a `div`. That
  is now the strongest case for end-to-end tests, and the rights table above is
  what they should walk alongside it: each of the four link shapes, and what is
  actually visible under it.

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
2. **A shopping view.** A pure function over the tree; it sums equal ingredients
   and shows how the amount splits up.
3. **Non-scaling amounts**, for a line like `Hefe: 1 Würfel` that should not
   double when the recipe does.
