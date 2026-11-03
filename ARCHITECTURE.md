# How the app works

Enough to rebuild it. What the other documents cover:

| | |
|---|---|
| `FORMAT.md` | the card file |
| `LAYOUT.md` | how a card becomes a table |
| `STYLE.md` | colours, type, placement |
| `GUIDE.md` | writing a recipe, for a person or a model |
| `recipe.schema.json` | a recipe as JSON, which is how one arrives from outside |

All five stay exactly as they are.

## What it is

A household tool for recipe cards. One person writes a card, hands someone a
link, and both can read it on a phone in the kitchen without a signal. There are
no accounts.

Two parts, no build step:

- **A server.** Serves the files and a handful of endpoints. No runtime
  dependencies, no database, no framework.
- **A browser app.** Plain ES modules, loaded directly. No bundler, no
  transpiler, no framework.

## Rights are rows

One setting decides how much access control this instance does, and it names the
mechanism rather than how secret it feels. `server/access.js` holds the whole
rule, so no route can disagree with another.

| `ACCESS_CONTROL` | | |
|---|---|---|
| `NONE` | no door | everyone who reaches the port reads, writes and deletes every recipe |
| `LOGIN` | one door | everyone signed in does the same |
| `GRANT` | one door, and owners | a recipe answers to a grant |

Under `NONE` and `LOGIN` nothing is anybody's, so the library is the whole server
and there is nothing to check per recipe. Under `GRANT` every question - who owns
this, who else may open it - is one lookup in `grants`:

```
grant { id, card, subject, scope, issued_by, created, expires? }
       subject: person:<id> | link:<sha256 of the token>
       scope:   owner | edit | read
```

A read says what the reader holds, in an `X-Lekka-Scope` header on the recipe
itself: `owner`, `edit` or `read`. The app draws it in the foot, so a recipe shared
for reading says so before `Save` is pressed on it. It rides on the read rather
than being asked for, because asking would be a second request for every recipe
opened - the same reason `Share` finds out whether a recipe is yours by opening
the panel rather than by checking before it draws the button. Under `NONE` and
`LOGIN` the answer is always `owner`: everybody through the door - and under
`NONE` there is no door - does everything, which is what owning it amounts to.

**Ownership is a grant, not a column.** A card has one `owner` grant or none,
which a partial unique index enforces, and `owner` carries `edit` carries `read`.
One mechanism answers everything, rather than a column for the owner and a table
for everybody else.

A subject is always a person. There was a link subject once - a token standing in for
whoever held it - and it never worked: the app asks who you are before it asks what you
came for, so a browser that had not signed in was sent to the sign-in screen rather than
to the recipe the link was for. Handing a recipe to somebody with no account here is a
capability this does not have, and `kind` survives on the row only because dropping a
column needs a migration this project has decided not to have. Every row says `person`.

An address is therefore a name and not a secret. `/r/<id>` opens for whoever a grant
names and answers 404 for everybody else, signed in or not, so there is nothing in it to
keep out of a log, a `Referer` or a chat. An older link with something after the id is
read for the id and rewritten to it.

Only an owner may look at who holds a recipe or hand it to anybody. Somebody
granted `edit` may change the recipe and never who else can see it, and every
refusal here is a 404 - the answer a recipe that is not there gives - so asking
about somebody else's card cannot even tell you it exists. The owner grant is on
the list like any other and is the one row that cannot be revoked: a recipe with
no owner is one nobody could reach again, so the panel offers `Delete` instead.

A card's `id` is its title as a slug, then 10 random characters. The slug is for
a human reading a directory listing; the random part is what makes an id
unguessable. It is lower case, because a case-blind filesystem would otherwise
merge two ids into one file. A session token and an invite token are 22 characters,
drawn by rejection sampling from an alphabet without look-alikes so that no
character is more likely than another and none of them can be misread aloud.

`Referrer-Policy: no-referrer` is still sent and still worth sending, but nothing
in an address is a secret any more: the id names a file and opens for whoever a
grant names. `app/link.js` is the one place that knows the shape of a link, which
is now `/r/<id>` and nothing else.

Somebody new arrives through an invite: a link, made by anybody already inside, which
whoever opens it turns into an account of their own. There is nothing for a second
browser of your own, because signing in is that already. The operator's first-boot
link is not a row - there is nobody yet to have issued it - but it answers at the
same address as the invite it is, so the screen that opens a link never has to know
where the link came from.

The first person to arrive keeps the instance: a flag on the row, set because they
were first, and the only thing it buys is seeing everybody and removing somebody. It
is a flag rather than a role table because there are two kinds of person here and no
third one coming. There is at most one, held by a partial unique index over the rows
that have it, so a second cannot be written even by a hand at the database - and that
one cannot be removed through the app at all, since an instance with nobody keeping
it has nobody who can ever remove anybody again. Handing it over is `sqlite3`, which
the README spells out. Removing somebody takes their sessions, credentials and invites
with the foreign keys; their grants take two paths, since what they were *lent* goes
with them and what they *owned* is handed to whoever removed them.

That same person takes every recipe nobody owns. Under `NONE` there is no session, so
a recipe is made with no owner grant - and under `GRANT` a recipe nobody owns is one
nobody can reach. It happens at every boot rather than only at the first, because the
door can be turned off for an afternoon and back on again, and what was written in
between would otherwise be stranded. With no orphans it does nothing, which is most
boots; when it does something it says so in the log.

Under `LOGIN` and `GRANT` a browser is a session: an opaque token in an `HttpOnly`
cookie, and a row naming the person it belongs to. `Secure` is set only over a
connection that is one, because the deployment this is written for is a LAN over
plain HTTP. A cookie is ambient authority, so every write also needs a matching
`Origin` and an `X-Lekka: 1` header that no cross-site form can set. `Bearer` is
still read, because `CREATE_TOKEN` uses it, and because it is the only credential
shape that could ever cross to another instance - a cookie cannot.

## Storage

One card is one file, named by its id. Everything else is a row.

```
data/cards/dinkelquarkbrot-7kmq2rxvbn.lekka
data/lekka.db
```

The split is deliberate and it is the only one. **A recipe is a file** because
being able to grep, diff, `rsync` and hand-restore one is the property this whole
project is built on, and a blob column throws that away for nothing. **Everything
around a recipe is a row** - when it was created, changed and last read, who owns
it, who else may open it, who is signed in - because those are small, numerous,
and read by more than one column. Asking a directory "what does this person own"
means opening every file in it; asking an index means one query.

The schema is applied on every open, and is written to be idempotent: the tables are
created where they are missing, then any column added since the file was written, then
the indexes - in that order, because an index can stand on a column an older data
directory has never heard of. That is the whole of it. Every change so far has been a
column with a default, which can simply be added; the first one that has to *move* data
rather than make room for it will need a version written into the file, and that is
deliberately not built yet.

`node:sqlite` ships with Node, so this is still a server with no dependencies and
one container. It is why the project is pinned to Node 24: the module is stable
there, and prints an experimental warning on every boot under 22.

A card is an id and three dates; `grants` holds everything about who may touch
it. Making one writes both inside a transaction, so a card that nobody can reach
cannot exist. The body is written to a temporary and renamed into place, which is
atomic - a power cut leaves the old recipe or the new one, never half of either.

Reading a card refreshes its `touched` stamp, at most once a day, so that an
optional `TTL_DAYS` sweep can delete what nobody has opened without ever deleting
what is in use. Unset, nothing is ever swept. The sweep also reaps what an
interrupted write left behind - a `.lekka` file no row points at, a temporary
whose rename never happened - since nothing can reach either. Deleting a card
takes its grants with it, which the foreign key does on its own.

The directory is the only copy. It must be a volume, and it must be backed up -
the database included.

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

**Recipes at `/`.** The library, from `GET /api/cards`, which answers with every
recipe's text and when it was added - one request for the list, the search and the
worker's copy for a kitchen without a signal. What it holds depends on the instance:
every recipe on the server under `NONE` and `LOGIN`, the ones a grant names you on
under `GRANT`. Each by name, with how long it takes and how much it makes. Search and
`+` float at the bottom, where a thumb is.

**Search at `/search`.** Over the library already read, so it answers as you type and
works offline. Each recipe answers once, with the best reason it answers - its name,
another name it goes by, an ingredient, a step - and says the reason when it is not the
name. Letters are compared without case or accents (`app/search.js`).

**A recipe at `/r/…`.** What it is, how long it takes, how many steps, where it came
from, and its own notes. Then how much it makes, a stepper when it is counted, and
everything that goes in, gathered from the steps once - the uses of one thing, one name
and aside, added up (`gather` in `app/recipe.js`) - its amounts ending under the middle
of the count. Then the steps, each read out as one sentence (`phrase`): the step's own
where it has one, each `{name}` drawn a little heavier, and otherwise one made of its
words, its time and its aside. What a step takes is listed right under its sentence, on
a band lit along its top that fades into the page, how much ending a third of the way
along the line. How much is set where it is shown: the stepper adds or takes a whole one,
and every amount in the gathered list is a field that looks like one, typing in which
scales the whole recipe by it. The rest follows in place, so a field keeps the keyboard.
Spoons, cups, litres and counts read in fractions, `1½ EL`; weights as a scale shows
them (`showAmount` in `app/amount.js`). `Start cooking` and the shopping list float at
the bottom; the table view, Edit, Share and Delete are behind `…`. On a wide screen it
is the same single column, and the bands fade out at their ends instead of meeting the
edge of the screen.

The look keeps one meaning per highlight: words in a serif, the phone's own, and every
amount and time in sans; a step's number in the serif's italic, set into the wavy rule
that starts it; saffron for time and ember for heat, wherever they stand. Durations are
as short as they go and still never read as a time of day: `15h15`, `45 min`, `2h`.

What lekka says is German or English, as the phone is set (`app/i18n.js`); a recipe is
in its own words whatever that is. The English is the key, so a line nobody translated
reads as written, and a test holds every line the screens say to its German.

A phone's keyboard covers the bottom of the page without telling it. Sheets and the
editor's forms stand above it instead (`watchKeyboard` in `app/ui.js`), and the bar at
the bottom steps aside while something in the page is typed into.

**Shopping at `/shop/…`,** a button right under the gathered list. The same list at the
amount the recipe was last scaled to, laid out the same way, less what is at home: every
line starts with a field at nothing, and typing what there is leaves the rest to buy. A
line there is all of, or one whose name is tapped, is crossed out and drops to the
bottom, at home, where a tap brings it back. Shared as plain text, so it goes into
Reminders, Notes or a message. What is at home is kept on the device, by recipe
(`app/shop.js`).

**Cooking at `/cook/…`.** The recipe's own list, walked through: the step done last
fades out above, the one to do now stands large with what it takes on a band under it,
and the next three wait below. On a wide screen every step stands down the side, with
its timer, a click from it. A step with a time has a button that starts its timer, which then
counts down in large saffron digits. Timers running on other steps stand at the top and
lead back to their step; one that has run out turns solid. `Next`, naming the step it
leads to, carries it on, and `Done cooking` ends it. All ingredients and ending early
are behind `…`. The screen stays on while it is up, and it is dark whatever the phone is set to.
What is being cooked is kept on the device (`app/cook.js`): which recipe, which
step, how much, and when each timer ends - the moment it ends, not a count, so a timer
is right again the moment the phone wakes. A timer that runs out rings, and again each
minute for five minutes. While something is cooking, a bar over every other screen says
what and how far, with the timer that ends first, and leads back in. One recipe is
cooked at a time; starting another asks first.

A phone that is locked, or a page it has put to sleep, rings nothing: the alarm is the
page's own sound, and only a push from the server could wake it. The screen kept on is
what stands in for that while cooking.

**Writing at `/new`.** The writer on an empty draft, with the caret in the name.
Nothing is sent until the first save: a recipe nobody finished writing never
reaches the server at all.

**The table.** The name, then the table, and the specification under it. Since the
native look this is the `Table` view of a recipe, still drawn as the datasheet.

Controls are sorted by what each one touches, which is the rule that says where
anything goes. The scale (½× 1× 1½× 2×) and `Fit to screen` change how the recipe
is drawn, so they sit above the table, beside what they change. `Edit` and
`Share` change the recipe or who holds it, so they sit below, out of the way of
reading. It is offered on
every recipe you can see: whether the write lands is the server's to say, and it
says so by refusing, which the writer reports in place. Hiding it on a guess
would be worse, since under `GRANT` the answer is a row this browser cannot read.

`Fit to screen` is the second answer to a table wider than the screen. Reading it
a step at a time keeps the type and gives up seeing it all; fitting shrinks the
table with `zoom` until it is inside the room it has, keeps the whole card and
gives up the type. The two are exclusive, so fitting turns the places and the
snapping off - there is nowhere left to scroll to - and the button is not offered
at all on a recipe that already fits.

Under the table are the **notes**: what a person wrote about the recipe that is
not in the table. Read they are text, written they are fields, and two more kinds
appear while writing - the yield and the recipe's own preparations - because that
is the only place either can be typed.

It once held sums as well, worked out by an `app/facts.js`: how long the recipe
takes end to end, what the dough weighs, how many rows and steps it has. They
were correct and nobody wanted them - a cook reads the table, and a count of the
rows in it is a fact about the drawing rather than about the food - so they went,
and the module with them. What survived is one regular expression, in `render.js`
where its only reader is: a duration inside a verb, which is the one thing in a
verb a cook looks for while the pan is already hot, and it is tagged so the eye
can find it in the words.

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

**The writer** (`app/write.js`) is where a recipe is written, new or not: the recipe as
it is read, with every part of it in reach. `Edit` opens it, and `New recipe` opens the
same page with nothing in it yet and the caret in the name. Its name, how much it makes,
a note, where it came from and what comes before the first step are fields at the top.
Its steps follow, each drawn as it reads, and a tap on a step's words or what goes in
opens that step in a sheet.

**A step's line carries what joins it to the step above, and a cut beside its words
splits it.** Joining is offered only where the step above goes straight into this one;
two steps from different strands cannot be one. `+ Step` under a step puts a new one
after it, which takes what that step made and hands it on to whatever took it before:
the chain is spliced where it was cut. Deleting a step takes its own ingredients with
it, and what went into it goes into the step after it, so nothing else comes apart; a
bar at the bottom takes it back for a few seconds instead of a question before.

**A step's sheet** holds its sentence, typed as plain words. The ingredients it names
are found by name, whole words in any case, and braced when it is stored, so nobody
types a brace; a tap on an ingredient it does not name yet puts it in at the caret. Its
short form, what the table labels the step with and the timer is read from, follows the
sentence until somebody writes one - the verb last in German, first in English, then any
heat and time in it. Its ingredients are an amount and a name each, a sort in brackets
after the name, and one can be moved into another step from its menu. `From step` says
which earlier steps go into it: ticking none starts a strand of its own beside the rest,
ticking two is where two strands meet.

**Merging** shows the two sentences one after the other, joined by the word for "then"
of the language the screens speak, to be read over before it lands; the ingredients of
both become one list, and the same one in both, in one unit, one line of their sum.
**Splitting** ticks what moves into the new step after it, and asks for both sentences.

**What comes before the first step belongs to the recipe**: when to start, the oven, the
tin. It is drawn before step 1, unnumbered, under a rule that says *before* where a
number would stand. A preparation under one step, from a card written before that, is
still read and shown in its step's sheet, there to be taken away and not added to.

The model is `app/edit.js`: the card being written as the forest it is - one tree when
finished, a few strands while it is not - and pure functions over it that the writer
only ever calls. `stepsIn` lists the steps in the order they are done, across every
strand, which is what the writer draws and numbers.

**Nothing is written until a sheet is done**, and nothing is sent until `Save`. Saving
writes the card as text and reads it back first; what would not survive is refused and
nothing is sent. What is still wrong is listed under the steps, each line opening the
step it is about. Leaving with changes asks first. Live-saving every keystroke would
publish half-typed words to everyone holding the read link.

**Text comes in through `Import`** rather than through an editor of its own: the text
parses before it is sent, and one that cannot be drawn is never stored.

Two hazards, both designed out:

- The writer **repaints itself** and never rebuilds the screen from the link. Every
  other screen does rebuild, which here would re-read the card from the server and
  throw the draft away.
- **It always writes at 1×.** Amounts elsewhere are shown scaled, and a number typed at
  2× would mean the doubled amount and have to be stored divided.

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

Who you are is never answered from a cache. `/api/me` and `/api/sessions` are
skipped by the worker, because a stale "signed in" is worse than no answer: the
app would draw a library it cannot load instead of the sign-in screen. Everything
else read through the door is cached, and dropped on any 401 and on signing out -
which stops future reads and cannot reach a copy already on the machine.

## Deployment

One container, `node:22-alpine`, read-only filesystem with a volume at the data
directory. It serves the app and the API on one port, and there is nothing else
to run.

The entrypoint is root only long enough to hand the data directory to the user
the server will run as, `PUID`/`PGID`, and skips even that when the directory
already belongs to them. Then it drops privileges and `exec`s the server, which
is therefore PID 1 and shuts down cleanly on `SIGTERM`. This is what lets any
mount work with no setup while the server itself never runs as root.

One thing is rendered on the server, and only one: the `<head>` of a shared card.
`/r/<id>` comes back with the recipe's name in a `<title>` and an `og:title`, so a link
pasted into a chat unfurls as what it is - and it is the half of the page that never
wants the key, since the id names the card and the fragment stays on the device. The
table is not rendered here and never will be: it is scaled, fitted and edited against a
screen this machine cannot see, and a second renderer would have to agree with
`render.js` cell for cell forever. The same route sends `X-Robots-Tag: noindex`, because
a recipe is unlisted rather than public - an unfurler reads the tags because a person
deliberately pasted the link, and a crawler that finds it in a forum thread is told to
leave it out.

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

- **A picture, from `node tools/shot.mjs`.** It serves the app, draws the card
  table into one page, and screenshots it with
  headless Chrome. Not an assertion - something to look at. It exists because
  the stub answers for what is *there* and nothing answers for what the
  stylesheet does to it: `repeat(0, 32px)` is not a track list, so
  `grid-template-columns` fell back to `none` and the card was drawn with every
  element present and every column the wrong width. Two of these side by side
  is what caught it.

- **Checks in a real browser, from `node tools/check.mjs`.** Same machinery as the
  picture - own server, headless Chrome - but it measures the table, drives the app
  through reading, scaling, shopping and writing a recipe, and reports `PASS`/`FAIL`
  per line, and exits non-zero.

  It exists because `node --test` has no layout and no caret: whether a row of the
  table says itself in one line at every scale, whether an amount fits its cell,
  whether the gathered amounts end under the middle of the count, and whether a step
  written, added, deleted and taken back reads as it should once saved.

  It runs twice. The first pass renders a module into a bare page, which is most
  of it. The second loads the app's own page with `main.js` running, because the
  router and the masthead are not modules and hold state across a change of
  screen: `show` replaces the screen and not the masthead, so a control put there
  by one view outlives it. A scale button left over from reading answers with
  `showCard`, which re-reads the recipe from the server - pressing it while
  writing threw the draft away without asking, and nothing in `node --test` could
  have seen it, because nothing in `node --test` runs `main.js` at all.

  So the rule is not "no browser tests". It is: assert in `node --test` whatever
  can be asserted about what the app *builds*, and keep the browser for what only
  a browser has - the caret, the cascade, layout, and the app assembled.

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
nothing in it is built for that. There is no admin interface and no rate limiting,
and those absences are deliberate. `ACCESS_CONTROL=LOGIN` or `GRANT` adds a login, which
narrows who may read what - it does not make the server safe on a public address, and
none of the work listed at the end of this section has been done.

What follows from that:

- Everyone who can reach the port can create cards. On a household network that
  is the household. `CREATE_TOKEN` narrows it if you want, but it is an extra,
  not a defence.
- **The limits in `server/limit.js` are off unless set**, and on a trusted network they
  should stay off: a recipe box that starts refusing its owner is worse than no limit at
  all. Two acts are counted when they are on, because two are the whole surface - making
  records, and following links to nothing. A 404 is either a link that has gone or a link
  that was guessed, and the answer is arranged so that nobody can tell which, so both are
  counted. They are a `Map` in one process, which is the same thing `alone()` already
  assumes: run one process, or neither holds.
- The link is still the only way to a card, because a link is how you hand a
  recipe to someone, not because we expect the network to be hostile.
- The operator has the data directory. That is the administration interface:
  `ls` and `cat` for the recipes, `sqlite3 data/lekka.db` for everything around
  them, and a backup. Building a second one over HTTP would only add a way in.

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
| Accounts as the only way in | `ACCESS_CONTROL=NONE` is still the default and still has no login at all. A door is opt-in, not the price of entry. |
| An admin interface over the cards | The operator has the data directory; `ls`, `cat` and `rm` need no code and cannot be reached from the network. Reading other people's recipes is not a feature. |
| Collections | They were the library, the sync unit and the sharing unit at once, which is why every awkward moment traced back to them. Ownership does the first two and a grant does the third. If grouping is ever wanted, a tag on a card is one column rather than a second thing to own. |
| A second permission mechanism | Ownership is a grant with scope `owner`, not a column beside the grants table. One lookup answers every question about who may touch a recipe. |
| Recipes in a database | A card stays a `.lekka` file, so it can be grepped, diffed, rsynced and restored by hand. Only what surrounds a card became rows, once "what does this person own" turned into a question a directory could not answer without opening every file in it. |

## What is worth adding, in this order

1. **Duration per step** as a real field, so a schedule can be computed
   backwards from when you want to eat. For sourdough this is the point where a
   card beats paper.
2. **A shopping view.** A pure function over the tree; it sums equal ingredients
   and shows how the amount splits up.
3. **Non-scaling amounts**, for a line like `Hefe: 1 Würfel` that should not
   double when the recipe does.
