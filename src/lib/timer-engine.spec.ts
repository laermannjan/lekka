import { describe, expect, it } from 'vitest';
import {
	canStartTimer,
	createTimer,
	finishTimer,
	isTimerDone,
	remainingSeconds,
	sortTimers
} from './timer-engine';

describe('createTimer', () => {
	it('targets an absolute wall-clock timestamp, not a tick count', () => {
		const timer = createTimer('a', 'Simmer', 600, 1_000);
		expect(timer).toEqual({
			id: 'a',
			label: 'Simmer',
			durationSec: 600,
			startedAt: 1_000,
			endAt: 601_000,
			finishedManually: false
		});
	});
});

describe('isTimerDone / remainingSeconds', () => {
	it('is not done before the target and done at or after it', () => {
		const timer = createTimer('a', 'Simmer', 60, 0);
		expect(isTimerDone(timer, 0)).toBe(false);
		expect(isTimerDone(timer, 59_999)).toBe(false);
		expect(isTimerDone(timer, 60_000)).toBe(true);
		expect(isTimerDone(timer, 61_000)).toBe(true);
	});

	it('reports done for a manually finished timer regardless of the clock', () => {
		const timer = finishTimer(createTimer('a', 'Simmer', 600, 0));
		expect(isTimerDone(timer, 0)).toBe(true);
	});

	it('never returns negative remaining time', () => {
		const timer = createTimer('a', 'Simmer', 60, 0);
		expect(remainingSeconds(timer, 90_000)).toBe(0);
	});
});

describe('canStartTimer', () => {
	it('allows starting when nothing is running yet', () => {
		expect(canStartTimer(undefined, 0)).toBe(true);
	});

	it('blocks starting a second concurrent run for the same step', () => {
		const timer = createTimer('a', 'Simmer', 600, 0);
		expect(canStartTimer(timer, 100)).toBe(false);
	});

	it('allows restarting once the previous run is done', () => {
		const timer = createTimer('a', 'Simmer', 60, 0);
		expect(canStartTimer(timer, 60_000)).toBe(true);
	});

	it('allows restarting once the previous run was manually finished', () => {
		const timer = finishTimer(createTimer('a', 'Simmer', 600, 0));
		expect(canStartTimer(timer, 0)).toBe(true);
	});
});

describe('sortTimers', () => {
	it('orders running timers soonest-to-finish first', () => {
		const slow = createTimer('slow', 'Simmer', 2700, 0);
		const fast = createTimer('fast', 'Toast', 180, 0);
		const mid = createTimer('mid', 'Rest', 600, 0);
		expect(sortTimers([slow, fast, mid], 0).map((t) => t.id)).toEqual(['fast', 'mid', 'slow']);
	});

	it('sorts done timers after every still-running one', () => {
		const running = createTimer('running', 'Simmer', 600, 0);
		const done = finishTimer(createTimer('done', 'Toast', 180, 0));
		expect(sortTimers([done, running], 0).map((t) => t.id)).toEqual(['running', 'done']);
	});
});
