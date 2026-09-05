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

Node 22 or newer. No dependencies, no build step.

```
npm run serve        # http://localhost:8080
npm test
npm run show test/cards/erdkruste.lekka 2   # draw a card in the terminal, doubled
```

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

One container, no database. **Read [the threat model](ARCHITECTURE.md#threat-model)
first**: this is built for a network you already trust, a LAN or a VPN, and it is
not hardened for the open internet.

| variable | default | |
|---|---|---|
| `PORT` | 8080 | |
| `DATA_DIR` | `./data` | the only thing to back up |
| `CREATE_TOKEN` | unset | when set, creating a card needs `Authorization: Bearer <token>` |
| `MAX_CARD_BYTES` | 65536 | largest card accepted |
| `MAX_COLLECTION_ROWS` | unset | most recipes one collection may hold; unset means no cap |
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

## Links are the rights

There are no accounts. A link is what grants access, so treat one like a key.

| | |
|---|---|
| `/r/<id>` | read a card |
| `/r/<id>#<key>` | read and edit it |
| `/c/<name>` | read a collection, with every edit key stripped out |
| `/c/<name>#<key>` | read and change it; opening this adopts the collection on the device |

The key is after the `#`, which is the one part of an address a browser sends
nowhere: not in the request line, not in a `Referer`, so not into an access log,
a proxy or a CDN. The older shape, with the key as a path segment, is still read
and is rewritten on arrival, so links already handed out keep working.

A collection is a list of card links, and that is all it is. Cards do not belong
to it.

## The data directory

```
data/cards/dinkelquarkbrot-7kmq2rxvbn.lekka        the card
data/cards/dinkelquarkbrot-7kmq2rxvbn.meta.json    key hash and timestamps
data/collections/purely-mellow-rhubarb-cypk.json
```

The file name is the link, so the directory can be read by eye. A card is the
`.lekka` file and the `.meta.json` beside it; a server started against an
existing directory needs nothing else, because there is no state anywhere but
here.

Back this directory up. It is the only copy.
