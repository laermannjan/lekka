<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
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
	<button type="submit">Apply</button>
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
			</li>
		{/each}
	</ul>
{:else if data.search}
	<p>No recipes match "{data.search}".</p>
{:else}
	<p>No recipes yet.</p>
{/if}

<h2>Add a recipe</h2>

{#if form?.recipeError}
	<p role="alert">{form.recipeError}</p>
{/if}

<form method="POST" action="?/createRecipe">
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
