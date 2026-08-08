<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { CATEGORY_GROUP_LABELS } from '$lib/categories';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const selectedCategoryIds = $derived(new Set(data.categoryIds));
	const isFiltered = $derived(
		data.categoryIds.length > 0 || data.favoritesOnly || data.collectionId !== undefined
	);

	// `?/createRecipe` on its own is a query-only reference: posting it replaces
	// the whole query string, so adding a Recipe would drop every active filter
	// and re-render an unfiltered browse. SvelteKit picks the action out of
	// whichever parameter starts with `/`, so the current filters ride along
	// ahead of it and the view the author was looking at survives the post.
	const createRecipeAction = $derived(
		page.url.search ? `${page.url.search}&/createRecipe` : '?/createRecipe'
	);
</script>

<h1>Recipes</h1>

<form method="GET">
	<label>
		Search
		<input type="search" name="q" value={data.search} placeholder="Search titles…" />
	</label>
	<label>
		Sort by
		<select name="sort" value={data.sort}>
			<option value="recently-added">Recently added</option>
			<option value="alphabetical">Alphabetical</option>
			<option value="last-cooked">Last cooked</option>
			<option value="most-cooked">Most cooked</option>
		</select>
	</label>
	{#if data.categories.length > 0}
		<fieldset>
			<legend>Categories</legend>
			<!-- Repeated `category` parameters, one per checked box - a Recipe has to
			     carry every one of them to show up (see `listRecipes`). -->
			{#each data.categories as category (category.id)}
				<label>
					<input
						type="checkbox"
						name="category"
						value={category.id}
						checked={selectedCategoryIds.has(category.id)}
					/>
					{CATEGORY_GROUP_LABELS[category.categoryGroup]}: {category.name}
				</label>
			{/each}
		</fieldset>
	{/if}
	<label>
		<input type="checkbox" name="favorites" value="1" checked={data.favoritesOnly} />
		Favorites only
	</label>
	{#if data.collections.length > 0}
		<label>
			Collection
			<select name="collection" value={data.collectionId === undefined ? '' : data.collectionId}>
				<option value="">Any</option>
				{#each data.collections as collection (collection.id)}
					<option value={collection.id}>{collection.name}</option>
				{/each}
			</select>
		</label>
	{/if}
	<button type="submit">Apply</button>
	{#if isFiltered || data.search}
		<a href={resolve('/')}>Clear filters</a>
	{/if}
</form>

{#if data.recipes.length > 0}
	<ul>
		{#each data.recipes as recipe (recipe.id)}
			<li>
				{#if recipe.isFavorite}★{/if}
				<a href={resolve('/recipes/[id]', { id: String(recipe.id) })}>{recipe.title}</a>
				{#if recipe.categories.length > 0}
					<em>({recipe.categories.map((c) => c.name).join(', ')})</em>
				{/if}
				{#if recipe.favoritedBy.length > 0}
					<em>★ {recipe.favoritedBy.map((p) => p.name).join(', ')}</em>
				{/if}
			</li>
		{/each}
	</ul>
{:else if data.search && isFiltered}
	<p>No recipes match "{data.search}" and the active filters.</p>
{:else if data.search}
	<p>No recipes match "{data.search}".</p>
{:else if isFiltered}
	<p>No recipes match the active filters.</p>
{:else}
	<p>No recipes yet.</p>
{/if}

<h2>Add a recipe</h2>

{#if form?.recipeError}
	<p role="alert">{form.recipeError}</p>
{/if}

<form method="POST" action={createRecipeAction}>
	<label>
		Title
		<input type="text" name="title" required maxlength="120" />
	</label>
	<label>
		Servings
		<input type="number" name="servings" min="1" step="1" value="4" />
	</label>

	<button type="submit">Add recipe</button>
</form>
