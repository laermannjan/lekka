import { describe, expect, it, beforeEach } from 'vitest';
import { db } from './db';
import { ingredientTags, ingredients, profileAvoidTags, profiles, tags } from './db/schema';
import {
	getAvoidTagIdsForProfiles,
	getAvoidTagsForProfile,
	getFlaggedTagsByIngredientIds,
	setProfileAvoidTags
} from './dietary';

describe('dietary', () => {
	beforeEach(() => {
		db.delete(profileAvoidTags).run();
		db.delete(ingredientTags).run();
		db.delete(ingredients).run();
		db.delete(profiles).run();
		db.delete(tags).run();
	});

	function makeProfile(name = 'Jan') {
		return db.insert(profiles).values({ name }).returning().get();
	}

	function makeTag(name: string, tagGroup: 'allergen' | 'diet' | 'sensory' = 'allergen') {
		return db.insert(tags).values({ name, tagGroup }).returning().get();
	}

	function makeIngredient(baseTerm = 'Milk') {
		return db.insert(ingredients).values({ baseTerm }).returning().get();
	}

	it('has no avoid-tags by default', () => {
		const profile = makeProfile();
		expect(getAvoidTagsForProfile(profile.id)).toEqual([]);
	});

	it('sets and lists a profile avoid-tag set', () => {
		const profile = makeProfile();
		const nuts = makeTag('nut-derived');
		const dairy = makeTag('dairy');

		setProfileAvoidTags(profile.id, [nuts.id, dairy.id]);

		const result = getAvoidTagsForProfile(profile.id)
			.map((t) => t.name)
			.sort();
		expect(result).toEqual(['dairy', 'nut-derived']);
	});

	it('replaces the whole set on a second call', () => {
		const profile = makeProfile();
		const nuts = makeTag('nut-derived');
		const dairy = makeTag('dairy');
		setProfileAvoidTags(profile.id, [nuts.id, dairy.id]);

		setProfileAvoidTags(profile.id, [dairy.id]);

		expect(getAvoidTagsForProfile(profile.id).map((t) => t.name)).toEqual(['dairy']);
	});

	it('clears the set when given an empty array', () => {
		const profile = makeProfile();
		const nuts = makeTag('nut-derived');
		setProfileAvoidTags(profile.id, [nuts.id]);

		setProfileAvoidTags(profile.id, []);

		expect(getAvoidTagsForProfile(profile.id)).toEqual([]);
	});

	it('tracks avoid-tags per profile independently', () => {
		const jan = makeProfile('Jan');
		const alex = makeProfile('Alex');
		const nuts = makeTag('nut-derived');
		setProfileAvoidTags(jan.id, [nuts.id]);

		expect(getAvoidTagsForProfile(jan.id)).toHaveLength(1);
		expect(getAvoidTagsForProfile(alex.id)).toEqual([]);
	});

	it('unions avoid-tag ids across several diner profiles', () => {
		const jan = makeProfile('Jan');
		const alex = makeProfile('Alex');
		const nuts = makeTag('nut-derived');
		const dairy = makeTag('dairy');
		setProfileAvoidTags(jan.id, [nuts.id]);
		setProfileAvoidTags(alex.id, [dairy.id]);

		const union = getAvoidTagIdsForProfiles([jan.id, alex.id]);

		expect(union).toEqual(new Set([nuts.id, dairy.id]));
	});

	it('returns an empty set for no diners', () => {
		expect(getAvoidTagIdsForProfiles([])).toEqual(new Set());
	});

	it('flags an ingredient carrying an avoided tag', () => {
		const nuts = makeTag('nut-derived');
		const almondMilk = makeIngredient('Almond milk');
		db.insert(ingredientTags).values({ ingredientId: almondMilk.id, tagId: nuts.id }).run();

		const result = getFlaggedTagsByIngredientIds([almondMilk.id], new Set([nuts.id]));

		expect(result.get(almondMilk.id)?.map((t) => t.name)).toEqual(['nut-derived']);
	});

	it('does not flag an ingredient whose tags are not avoided', () => {
		const nuts = makeTag('nut-derived');
		const dairy = makeTag('dairy');
		const milk = makeIngredient('Milk');
		db.insert(ingredientTags).values({ ingredientId: milk.id, tagId: dairy.id }).run();

		const result = getFlaggedTagsByIngredientIds([milk.id], new Set([nuts.id]));

		expect(result.get(milk.id)).toBeUndefined();
	});

	it('returns empty when no tags are avoided', () => {
		const milk = makeIngredient('Milk');
		expect(getFlaggedTagsByIngredientIds([milk.id], new Set())).toEqual(new Map());
	});
});
