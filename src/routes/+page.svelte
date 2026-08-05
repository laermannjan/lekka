<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1>Recipes</h1>

{#if data.recipes.length > 0}
	<ul>
		{#each data.recipes as recipe (recipe.id)}
			<li><a href={resolve('/recipes/[id]', { id: String(recipe.id) })}>{recipe.title}</a></li>
		{/each}
	</ul>
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
