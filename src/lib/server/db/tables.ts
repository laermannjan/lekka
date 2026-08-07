// The tables of this database, ordered child-before-parent: deleting in this
// order never trips a foreign key, and reversing it is a safe insert order.
//
// Named once here because "every table there is" is a fact that goes stale
// silently. A restore that misses one leaves rows behind (see ../data-export.ts),
// and a test reset that misses one leaks state into the next test - or hides a
// bug in the table it forgot, which is how a suite stayed green while every
// revert deleted a Recipe's whole Cook history (#51).
import {
	categories,
	collections,
	collectionRecipes,
	compositions,
	compositionSteps,
	cookDiners,
	cookLogAnnotations,
	cooks,
	favorites,
	ingredients,
	ingredientTags,
	ingredientUsages,
	profileAvoidTags,
	profiles,
	pushSubscriptions,
	recipeCategories,
	recipeVersions,
	recipes,
	scalingFormulas,
	scheduledPushes,
	steps,
	tags,
	vapidKeys
} from './schema';

// Household data - what an export covers (see ../data-export.ts).
export const DOMAIN_TABLES_CHILD_FIRST = [
	cookLogAnnotations,
	cookDiners,
	cooks,
	scalingFormulas,
	ingredientUsages,
	compositionSteps,
	recipeVersions,
	steps,
	compositions,
	favorites,
	recipeCategories,
	collectionRecipes,
	collections,
	profileAvoidTags,
	ingredientTags,
	categories,
	tags,
	ingredients,
	recipes,
	profiles
];

// Server-instance and per-device infrastructure: a VAPID keypair bound to this
// server, a browser's push endpoint, in-flight scheduling state. Deliberately
// outside an export, and holding no reference into the domain tables.
export const INFRASTRUCTURE_TABLES_CHILD_FIRST = [scheduledPushes, pushSubscriptions, vapidKeys];

export const ALL_TABLES_CHILD_FIRST = [
	...INFRASTRUCTURE_TABLES_CHILD_FIRST,
	...DOMAIN_TABLES_CHILD_FIRST
];
