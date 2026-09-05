# lekka

Recipe cards as tables, after the notation on Cooking for Engineers. A recipe is
a flow: ingredients go into a step, its result goes into the next. The card
writes that flow down and draws it as a table, where rows are ingredients and
columns are time.

```
# Pfannkuchen (12 Stück)

- braten (2 min je Seite)
  - verrühren
    - Mehl: 250 g
    - Milch: 500 ml
    - Eier: 2
  - schmelzen
    - Butter: 30 g
```

```
250 g  Mehl   ┐
500 ml Milch  ├ verrühren ┐
2      Eier   ┘           │
                          ├ braten
30 g   Butter ─ schmelzen ┘        (2 min je Seite)
```

The documents that define it: [FORMAT.md](FORMAT.md) for the file,
[LAYOUT.md](LAYOUT.md) for the table, [STYLE.md](STYLE.md) for how it looks,
[CONVERTING.md](CONVERTING.md) for turning an ordinary recipe into a card, and
[ARCHITECTURE.md](ARCHITECTURE.md) for how the software works.

## Running it

Node 24 or newer, for the built-in SQLite. No dependencies, no build step.

```
npm run serve        # http://localhost:8080, restarted when a server file changes
npm test
npm run check        # drive the editor in a real browser; needs Chrome
npm run show test/cards/erdkruste.lekka 2   # draw a card in the terminal, doubled
```

With [mise](https://mise.jdx.dev), which runs those same scripts under a pinned
Node and the two settings a checkout needs:

```
mise run serve       # http://localhost:8080
mise run serve 8081  # somewhere else, for one run
mise run up          # the container, on http://localhost:8380
```

`serve` watches what the server imports - `server/` and the two modules it
shares with the app - and restarts on a change to any of it. The rest of `app/`
is read from disk on every request, so a browser reload is enough there. The
image starts the server directly rather than through npm, because it must not
watch and wants to be PID 1.

## Deploying it

Without cloning anything. Save this as `compose.yaml` and run
`docker compose up -d`:

```yaml
services:
  lekka:
    image: ghcr.io/laermannjan/lekka:latest
    restart: unless-stopped
    read_only: true
    cap_drop: [ALL]
    cap_add: [CHOWN, SETUID, SETGID, DAC_OVERRIDE]
    security_opt: [no-new-privileges:true]
    tmpfs: [/tmp]
    ports: ["8380:8080"]
    volumes: [lekka-data:/data]

volumes:
  lekka-data:
```

From a checkout, `cd deploy && docker compose up -d` does the same, and
uncommenting `build: ..` there builds the image yourself.

One container, no dependencies. Recipes are `.lekka` files you can read with `cat`;
everything around them lives in `data/lekka.db`, which is SQLite built into Node.
**Read [the threat model](ARCHITECTURE.md#threat-model)
first**: this is built for a network you already trust, a LAN or a VPN, and it is
not hardened for the open internet.

| variable | default | |
|---|---|---|
| `PORT` | 8080 | |
| `DATA_DIR` | `./data` | the only thing to back up |
| `ACCESS_CONTROL` | `NONE` | how much of it this instance does - see below. `LOGIN` and `GRANT` print a one-time link on first boot, which is how the first person is made |

| `CREATE_TOKEN` | unset | when set, creating a card needs `Authorization: Bearer <token>` |
| `MAX_CARD_BYTES` | 65536 | largest card accepted |
| `MAX_CREATES_PER_HOUR` | unset | creations one address may make in an hour; unset means no limit |
| `MAX_TRIES_PER_MINUTE` | unset | links one address may follow to nothing in a minute; unset means no limit |
| `TRUST_PROXY` | unset | set to `1` behind a reverse proxy, so the two limits above count the forwarded address rather than the proxy |
| `TTL_DAYS` | unset | delete what nobody has opened for this long; unset means never |

The last five are off by default, and on a network you already trust they should
stay off: the people who can reach the port are the household, and a recipe box
that starts refusing its owner is worse than no limit at all. They exist for an
instance on a public address, which needs all of them - and needs more than them.
`TRUST_PROXY` is opt-in because a forwarded address believed without being asked
for is a limit anyone walks around by typing a different name into a header.

The container has a read-only filesystem and a volume at `/data`. Mounting a
directory of your own instead is one line in `compose.yaml`, and needs no
`chown`:

```yaml
volumes:
  - ./data:/data
```

The entrypoint is root only long enough to hand `/data` to the user the server
runs as, and skips even that when the directory already belongs to them. The
server itself never runs as root. To have the cards owned by you rather than by
uid 1000, put your own ids in `deploy/.env`:

```
printf 'PUID=%s\nPGID=%s\n' "$(id -u)" "$(id -g)" > deploy/.env
```

## Who may open what

One setting decides, and it names the mechanism rather than how secret it feels.

| `ACCESS_CONTROL` | | |
|---|---|---|
| `NONE` | no door | everyone who reaches the port reads, writes and deletes every recipe. The library is the whole server |
| `LOGIN` | one door | everyone signed in does the same. Nothing behind the door is anybody's in particular |
| `GRANT` | one door, and owners | a recipe answers to a grant. Yours are yours; the rest you were given |

### Getting in, and letting others in

`LOGIN` and `GRANT` print a link on first boot - `Open /join#… to make the first
one` - and whoever opens it becomes the first person and picks their password.
It works once.

Whoever opens that first link **keeps the instance**: they are the one who can see
everybody on it and remove somebody. There is exactly one, which the database
enforces rather than the code remembering to, and they cannot be removed from
inside the app - not by themselves, not by anybody. An instance with nobody keeping
it has nobody who can ever remove anybody again.

Handing that over is a thing you do on the box, in the order the index requires:

```
sqlite3 data/lekka.db \
  "update people set admin = 0 where admin = 1; \
   update people set admin = 1 where name = 'Rita';"
```

After that, everything happens from **your name in the masthead**, which opens the
list of browsers you are signed in on:

- **Invite someone** hands you a link for somebody who is not here yet. They pick
  their own name and password when they open it, and arrive with an empty library.
  It works once and expires in an hour; only its hash is stored, so a lost link is
  reissued rather than recovered.
- **Sign out of this browser** ends this session, and **Revoke** ends another one.
- **People**, for whoever keeps the instance, lists everybody and removes somebody.
  Removing them ends their sessions and hands any recipe they owned to you, because
  a recipe left with no owner is one nobody could reach again.

There is nothing for adding a second browser of your own, because signing in is that
already.

Recipes made while `ACCESS_CONTROL` was `NONE` belong to nobody. The first person to
arrive takes them, which is the one moment the answer is obvious.

Under `GRANT` a grant is one row saying *this subject may do this, until taken
back*. The subject is a person, who signs in as themselves, or a link, which is
whoever holds the token. `Share` on a recipe you own lists everyone who holds it,
and offers everybody else on the instance with what they already hold beside their
name - so choosing is done with the answer in front of you. Choosing somebody who
already holds something changes what they hold rather than adding a second row.
`Make a link instead` mints one for somebody with no account here, shown once with
a QR code, expiring when you say and revocable on its own. A link token rides in the fragment of `/r/<id>#<token>`,
which is the one part of an address a browser sends nowhere: not in the request
line, not in a `Referer`, so not into an access log, a proxy or a CDN. The older
shape, with the token as a path segment, is still read and rewritten on arrival.

## The data directory

```
data/cards/dinkelquarkbrot-7kmq2rxvbn.lekka    the recipe, and the only file
data/lekka.db                                  everything else
```

A recipe is a file you can `cat`, `grep`, `diff` and restore by hand. Its id, its
dates, who owns it, who else may open it, and who is signed in are rows in
`lekka.db`, which is the SQLite built into Node - still no dependencies.

Back this directory up. It is the only copy, the database included.
