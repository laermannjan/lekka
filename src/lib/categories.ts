import type { CategoryGroup } from '$lib/server/db/schema';

// Display labels for Category Group - the small, fixed classification of what
// kind of thing a Category describes (see CONTEXT.md's Category Group). Lives
// client-side, next to the other display helpers, because more than one view
// renders a Category next to its group: the Recipe page's picker and the
// browse filter both do, and a second copy of the mapping is how they'd drift.
//
// Keyed on `CategoryGroup` rather than plain `string` so adding a group to the
// schema's `CATEGORY_GROUPS` without a label here fails the build, instead of
// rendering "undefined: mexican" at runtime. The import is type-only and is
// erased before the client bundle is built, so no server module travels with
// it.
export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
	'meal-type': 'Meal type',
	cuisine: 'Cuisine',
	course: 'Course'
};
