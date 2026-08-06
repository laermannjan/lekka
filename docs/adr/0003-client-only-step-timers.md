---
date: 2026-08-05
status: superseded in part by ADR-0004
---

# Step timers are client-side only in v1

#24 asked for start/run/manually-finish timers on any Step carrying a Duration, plus a compact active-timer count, an on-demand panel, and running state synced between the Step card and the panel. Prior research (`docs/research/pwa-timer-notifications.md`) established that a pure client-side timer cannot reliably notify once the tab is hidden or the phone is locked, since every engine throttles or suspends background timers. We shipped only the "screen on, actively cooking" case for this ticket and deferred notification entirely.

A single `TimerStore` (`src/lib/timers.svelte.ts`, wrapping pure state transitions in `src/lib/timer-engine.ts`) is scoped to the recipe page and holds an absolute wall-clock target per timer (`Date.now() + durationSec * 1000`) rather than a tick-decremented countdown, recomputed from the clock on every tick so browser timer throttling delays only the redraw, never the actual target time. A timer counts down from a Step's Duration `min` (always present) rather than `max` (optional) or an average, since `min` needs no additional business rule to pick.

## Considered options

- **Local `Notification`/`showNotification()` alerts**: still fail the phone-locked case per the research, so they would have created a false impression of reliability without solving the real problem.
- **Persisting timer state server-side or in `localStorage`**: no acceptance criterion asked for surviving a reload, and it would have blurred the line with the Web Push work's own state model, which needs to be authoritative once it exists.

The deferred server-side component landed as ADR-0004; everything else here still stands.
