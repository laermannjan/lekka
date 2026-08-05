// Converts a Step's Duration (see CONTEXT.md) into seconds for a client-side
// timer, and formats a remaining-seconds count back into a display string.
// `durationUnit` is author-entered free text (not a closed enum - see
// src/lib/server/recipes.ts's validateDuration), so parsing is deliberately
// forgiving of common spellings and returns `null` for anything it doesn't
// recognize rather than guessing wrong.

const SECONDS_PER_UNIT: Record<string, number> = {
	second: 1,
	seconds: 1,
	sec: 1,
	secs: 1,
	s: 1,
	minute: 60,
	minutes: 60,
	min: 60,
	mins: 60,
	m: 60,
	hour: 3600,
	hours: 3600,
	hr: 3600,
	hrs: 3600,
	h: 3600
};

/**
 * A timer counts down from a Step's Duration `min` - the guaranteed lower
 * bound - not `max`, since `min` is always present while `max` is optional.
 * Returns `null` when the unit isn't a recognized time unit, or `min` isn't
 * a usable positive number - callers should treat that as "no timer
 * available for this Step", not fall back to a guess.
 */
export function parseDurationSeconds(min: number, unit: string): number | null {
	if (!Number.isFinite(min) || min <= 0) return null;
	const multiplier = SECONDS_PER_UNIT[unit.trim().toLowerCase()];
	if (!multiplier) return null;
	return Math.round(min * multiplier);
}

/** Formats a non-negative seconds count as `m:ss`, or `h:mm:ss` past an hour. */
export function formatRemaining(seconds: number): string {
	const clamped = Math.max(0, Math.ceil(seconds));
	const hours = Math.floor(clamped / 3600);
	const minutes = Math.floor((clamped % 3600) / 60);
	const secs = clamped % 60;
	const paddedSecs = String(secs).padStart(2, '0');
	if (hours > 0) {
		return `${hours}:${String(minutes).padStart(2, '0')}:${paddedSecs}`;
	}
	return `${minutes}:${paddedSecs}`;
}
