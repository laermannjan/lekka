import { expect, test } from '@playwright/test';

// One smoke test over the household's core loop: pick a Profile, add a Recipe,
// favorite it, and see that Favorite from another Profile. It covers the paths
// that have to work for the app to be usable at all (boot, migrate-on-boot,
// the no-auth Profile picker, browse, recipe detail) rather than trying to
// re-cover the server modules the unit suite already exercises directly.

// A Profile is picked, never authenticated (see CONTEXT.md's Profile), so
// "log in as someone else" is just a fresh browser context.
async function pickProfile(page: import('@playwright/test').Page, name: string) {
	await page.goto('/profile');
	const existing = page.getByRole('button', { name, exact: true });
	if (await existing.count()) {
		await existing.first().click();
		return;
	}
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Add profile' }).click();
}

test('a household member picks a profile, adds a recipe, and favorites it', async ({ page }) => {
	await page.goto('/');
	// No Profile yet, so the shell sends us to the picker.
	await expect(page).toHaveURL(/\/profile$/);

	await pickProfile(page, 'Jan');
	await expect(page).toHaveURL(/\/$/);

	await page.getByLabel('Title').fill('Chilli con carne');
	await page.getByRole('button', { name: 'Add recipe' }).click();

	const recipeLink = page.getByRole('link', { name: 'Chilli con carne' });
	await expect(recipeLink).toBeVisible();

	await recipeLink.click();
	await page.getByRole('button', { name: '☆ Mark as favorite' }).click();
	await expect(page.getByRole('button', { name: '★ Favorited' })).toBeVisible();
	await expect(page.getByText('Favorited by Jan.')).toBeVisible();
});

test('a favorite set by one profile is visible to another', async ({ browser }) => {
	const janContext = await browser.newContext();
	const janPage = await janContext.newPage();
	await pickProfile(janPage, 'Ada');
	await janPage.getByLabel('Title').fill('Shakshuka');
	await janPage.getByRole('button', { name: 'Add recipe' }).click();
	await janPage.getByRole('link', { name: 'Shakshuka' }).click();
	await janPage.getByRole('button', { name: '☆ Mark as favorite' }).click();
	await expect(janPage.getByRole('button', { name: '★ Favorited' })).toBeVisible();
	await janContext.close();

	// A different Profile in a different browser: the Favorite is Ada's to set
	// but the whole household can see it (CONTEXT.md's Favorite).
	const otherContext = await browser.newContext();
	const otherPage = await otherContext.newPage();
	await pickProfile(otherPage, 'Sam');
	await otherPage.getByRole('link', { name: 'Shakshuka' }).click();
	await expect(otherPage.getByText('Favorited by Ada.')).toBeVisible();
	// ...without it being mistaken for Sam's own.
	await expect(otherPage.getByRole('button', { name: '☆ Mark as favorite' })).toBeVisible();
	await otherContext.close();
});

// The browse filters live in the URL and nowhere else (#44), which is what
// makes a filtered view linkable - so the check that matters end to end is
// that applying one lands in the URL and survives a fresh load of it.
test('a browse filter lands in the URL and survives a reload', async ({ page }) => {
	await pickProfile(page, 'Kim');
	await page.getByLabel('Title').fill('Pierogi');
	await page.getByRole('button', { name: 'Add recipe' }).click();
	await page.getByLabel('Title').fill('Bigos');
	await page.getByRole('button', { name: 'Add recipe' }).click();

	await page.getByRole('link', { name: 'Pierogi' }).click();
	await page.getByRole('button', { name: '☆ Mark as favorite' }).click();
	await expect(page.getByRole('button', { name: '★ Favorited' })).toBeVisible();
	await page.goto('/');

	await page.getByLabel('Favorites only').check();
	await page.getByRole('button', { name: 'Apply' }).click();

	await expect(page).toHaveURL(/favorites=1/);
	await expect(page.getByRole('link', { name: 'Pierogi' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Bigos' })).toHaveCount(0);

	// Reloading the same URL reproduces the same filtered view.
	await page.reload();
	await expect(page.getByLabel('Favorites only')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Pierogi' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Bigos' })).toHaveCount(0);

	// Adding a Recipe posts to this same page, and must not throw the filters
	// away on the way through.
	await page.getByLabel('Title').fill('Zurek');
	await page.getByRole('button', { name: 'Add recipe' }).click();
	await expect(page).toHaveURL(/favorites=1/);
	await expect(page.getByLabel('Favorites only')).toBeChecked();
	await expect(page.getByRole('link', { name: 'Pierogi' })).toBeVisible();
});
