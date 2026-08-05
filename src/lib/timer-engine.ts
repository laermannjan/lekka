// Pure state-transition logic for client-side Step timers (see
// src/lib/timers.svelte.ts for the reactive wrapper used by the UI, and
// docs/decisions.md for why this is client-side only in v1). Kept free of
// Svelte runes so it's plain, fast-to-test TypeScript - the reactive
// wrapper is a thin shell around these functions.
//
// Timers key off a wall-clock target timestamp (`endAt = now + durationSec
// * 1000`), not a tick-decremented countdown, so remaining time is always
// recomputed from `Date.now()` rather than accumulated `setInterval` drift.

export type TimerState = {
	id: string;
	label: string;
	durationSec: number;
	startedAt: number;
	endAt: number;
	finishedManually: boolean;
};

export function createTimer(
	id: string,
	label: string,
	durationSec: number,
	now: number
): TimerState {
	return {
		id,
		label,
		durationSec,
		startedAt: now,
		endAt: now + durationSec * 1000,
		finishedManually: false
	};
}

/** A Step can start a new timer once any previous run for it is done. */
export function canStartTimer(existing: TimerState | undefined, now: number): boolean {
	return !existing || isTimerDone(existing, now);
}

export function finishTimer(timer: TimerState): TimerState {
	return { ...timer, finishedManually: true };
}

export function isTimerDone(timer: TimerState, now: number): boolean {
	return timer.finishedManually || now >= timer.endAt;
}

export function remainingSeconds(timer: TimerState, now: number): number {
	return Math.max(0, Math.ceil((timer.endAt - now) / 1000));
}

/** Soonest-to-finish first; done timers (manually finished or elapsed) sort last. */
export function sortTimers(timers: TimerState[], now: number): TimerState[] {
	return [...timers].sort((a, b) => {
		const aDone = isTimerDone(a, now);
		const bDone = isTimerDone(b, now);
		if (aDone !== bDone) return aDone ? 1 : -1;
		return a.endAt - b.endAt;
	});
}
