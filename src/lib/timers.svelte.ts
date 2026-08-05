// Reactive store backing the recipe page's step timers: one source of
// truth for every running/finished timer, shared by the compact badge, the
// on-demand panel, and each Step card so all three stay in sync (see issue
// #24). State transitions live in timer-engine.ts; this class just wraps
// them in Svelte 5 runes and drives the wall-clock tick.
import {
	canStartTimer,
	createTimer,
	finishTimer,
	isTimerDone,
	remainingSeconds,
	sortTimers,
	type TimerState
} from './timer-engine';

export class TimerStore {
	#timers = $state<Record<string, TimerState>>({});
	#now = $state(Date.now());

	/** Re-syncs to the wall clock. Call from a component's own interval. */
	tick(now: number = Date.now()) {
		this.#now = now;
	}

	/** No-op if a timer for `id` is already running - restart only once it's done. */
	start(id: string, label: string, durationSec: number) {
		const existing = this.#timers[id];
		if (!canStartTimer(existing, this.#now)) return;
		this.#timers[id] = createTimer(id, label, durationSec, this.#now);
	}

	finish(id: string) {
		const existing = this.#timers[id];
		if (!existing) return;
		this.#timers[id] = finishTimer(existing);
	}

	get(id: string): TimerState | undefined {
		return this.#timers[id];
	}

	isDone(timer: TimerState): boolean {
		return isTimerDone(timer, this.#now);
	}

	remaining(timer: TimerState): number {
		return remainingSeconds(timer, this.#now);
	}

	/** Every timer, soonest-to-finish first, done ones last - for the panel. */
	get sorted(): TimerState[] {
		return sortTimers(Object.values(this.#timers), this.#now);
	}

	/** Count of still-running timers - for the compact badge. */
	get activeCount(): number {
		return this.sorted.reduce((count, timer) => count + (this.isDone(timer) ? 0 : 1), 0);
	}
}
