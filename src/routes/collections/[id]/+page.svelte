<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const memberRecipeIds = $derived(new Set(data.collection.recipes.map((r) => r.id)));
	const availableRecipes = $derived(data.recipes.filter((r) => !memberRecipeIds.has(r.id)));
</script>

<h1>{data.collection.name}</h1>

{#if form?.recipeError}
	<p role="alert">{form.recipeError}</p>
{/if}

{#if data.collection.recipes.length > 0}
	<ul>
		{#each data.collection.recipes as recipe (recipe.id)}
			<li>
				<a href={resolve('/recipes/[id]', { id: String(recipe.id) })}>{recipe.title}</a>
				<form method="POST" action="?/removeRecipe" style="display: inline">
					<input type="hidden" name="recipeId" value={recipe.id} />
					<button type="submit">Remove</button>
				</form>
			</li>
		{/each}
	</ul>
{:else}
	<p>No recipes in this collection yet.</p>
{/if}

{#if availableRecipes.length > 0}
	<h2>Add a recipe</h2>
	<form method="POST" action="?/addRecipe">
		<label>
			Recipe
			<select name="recipeId">
				{#each availableRecipes as recipe (recipe.id)}
					<option value={recipe.id}>{recipe.title}</option>
				{/each}
			</select>
		</label>
		<button type="submit">Add</button>
	</form>
{/if}
