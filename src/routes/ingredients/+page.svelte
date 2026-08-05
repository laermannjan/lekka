<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const tagsByGroup = $derived(
		Object.groupBy(data.tags, (tag) => tag.tagGroup) as Partial<Record<string, typeof data.tags>>
	);
	const groupLabels: Record<string, string> = {
		allergen: 'Allergen',
		diet: 'Diet',
		sensory: 'Sensory'
	};
</script>

<h1>Ingredients</h1>

{#if data.ingredients.length > 0}
	<ul>
		{#each data.ingredients as ingredient (ingredient.id)}
			<li>
				<strong>{ingredient.baseTerm}</strong>
				{#if ingredient.descriptors}
					<span>({ingredient.descriptors})</span>
				{/if}
				{#if ingredient.roundToWholeUnit}
					<span title="Displayed quantity rounds to the nearest whole number">round</span>
				{/if}
				{#if ingredient.tags.length > 0}
					<span>— {ingredient.tags.map((t) => t.name).join(', ')}</span>
				{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p>No ingredients yet.</p>
{/if}

<h2>Add an ingredient</h2>

{#if form?.ingredientError}
	<p role="alert">{form.ingredientError}</p>
{/if}

<form method="POST" action="?/createIngredient">
	<label>
		Base term
		<input type="text" name="baseTerm" required maxlength="80" list="base-term-options" />
	</label>
	<datalist id="base-term-options">
		{#each data.baseTerms as baseTerm (baseTerm)}
			<option value={baseTerm}></option>
		{/each}
	</datalist>

	<label>
		Descriptors
		<input type="text" name="descriptors" placeholder="e.g. almond, unsweetened" />
	</label>

	<fieldset>
		<legend>Tags</legend>
		{#each Object.entries(groupLabels) as [group, label] (group)}
			<fieldset>
				<legend>{label}</legend>
				{#each tagsByGroup[group] ?? [] as tag (tag.id)}
					<label>
						<input type="checkbox" name="tagIds" value={tag.id} />
						{tag.name}
					</label>
				{/each}
			</fieldset>
		{/each}
	</fieldset>

	<label>
		<input type="checkbox" name="roundToWholeUnit" />
		Round displayed quantity to the nearest whole number (presentational only)
	</label>

	<button type="submit">Add ingredient</button>
</form>

<h2>Add a tag</h2>

{#if form?.tagError}
	<p role="alert">{form.tagError}</p>
{/if}

<form method="POST" action="?/createTag">
	<label>
		Name
		<input type="text" name="name" required maxlength="60" list="tag-name-options" />
	</label>
	<datalist id="tag-name-options">
		{#each data.tags as tag (tag.id)}
			<option value={tag.name}></option>
		{/each}
	</datalist>

	<label>
		Group
		<select name="tagGroup" required>
			{#each Object.entries(groupLabels) as [group, label] (group)}
				<option value={group}>{label}</option>
			{/each}
		</select>
	</label>

	<button type="submit">Add tag</button>
</form>
