import { describe, expect, it } from 'vitest';
import { formatRemaining, parseDurationSeconds } from './duration';

describe('parseDurationSeconds', () => {
	it('converts recognized minute spellings', () => {
		expect(parseDurationSeconds(3, 'minutes')).toBe(180);
		expect(parseDurationSeconds(3, 'min')).toBe(180);
		expect(parseDurationSeconds(3, 'MIN')).toBe(180);
		expect(parseDurationSeconds(3, '  m ')).toBe(180);
	});

	it('converts seconds and hours', () => {
		expect(parseDurationSeconds(90, 'seconds')).toBe(90);
		expect(parseDurationSeconds(1.5, 'hours')).toBe(5400);
	});

	it('returns null for an unrecognized unit', () => {
		expect(parseDurationSeconds(3, 'batches')).toBeNull();
	});

	it('returns null for a non-positive or non-finite min', () => {
		expect(parseDurationSeconds(0, 'minutes')).toBeNull();
		expect(parseDurationSeconds(-1, 'minutes')).toBeNull();
		expect(parseDurationSeconds(NaN, 'minutes')).toBeNull();
	});
});

describe('formatRemaining', () => {
	it('formats under an hour as m:ss', () => {
		expect(formatRemaining(0)).toBe('0:00');
		expect(formatRemaining(65)).toBe('1:05');
		expect(formatRemaining(599)).toBe('9:59');
	});

	it('formats an hour or more as h:mm:ss', () => {
		expect(formatRemaining(3661)).toBe('1:01:01');
	});

	it('clamps negative input to zero', () => {
		expect(formatRemaining(-5)).toBe('0:00');
	});

	it('rounds up fractional seconds so it never shows 0:00 while time remains', () => {
		expect(formatRemaining(0.2)).toBe('0:01');
	});
});
