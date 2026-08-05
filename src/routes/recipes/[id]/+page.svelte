<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const allUsages = $derived(data.recipe.steps.flatMap((step) => step.usages));
</script>

<h1>{data.recipe.title}</h1>

<h2>Steps</h2>

{#if form?.stepError}
	<p role="alert">{form.stepError}</p>
{/if}
{#if form?.usageError}
	<p role="alert">{form.usageError}</p>
{/if}

{#if data.recipe.steps.length > 0}
	<ol>
		{#each data.recipe.steps as step (step.id)}
			<li>
				<p>{step.renderedInstruction}</p>
				{#if step.durationKind}
					<p>
						<em
							>{step.durationKind}: {step.durationMin}{#if step.durationMax}–{step.durationMax}{/if}
							{step.durationUnit}</em
						>
					</p>
				{/if}

				{#if step.usages.length > 0}
					<ul>
						{#each step.usages as usage, i (usage.id)}
							<li>
								<code>{`{{${i + 1}}}`}</code>
								{usage.ingredient.baseTerm}{#if usage.ingredient.descriptors}
									({usage.ingredient.descriptors}){/if} —
								{usage.displayQuantity}
								{#if usage.prepAttribute}, {usage.prepAttribute}{/if}
								{#if usage.note}<span>— {usage.note}</span>{/if}
							</li>
						{/each}
					</ul>
				{/if}

				<details>
					<summary>Edit instruction</summary>
					<form method="POST" action="?/updateStepInstruction">
						<input type="hidden" name="stepId" value={step.id} />
						<label>
							Instruction (reference a usage above with its <code>{'{{n}}'}</code> token)
							<textarea name="instruction" required maxlength="2000">{step.instruction}</textarea>
						</label>
						<button type="submit">Save instruction</button>
					</form>
				</details>

				<details>
					<summary>Add an ingredient usage</summary>
					<form method="POST" action="?/addIngredientUsage">
						<input type="hidden" name="stepId" value={step.id} />
						<label>
							Ingredient
							<select name="ingredientId" required>
								{#each data.ingredients as ingredient (ingredient.id)}
									<option value={ingredient.id}
										>{ingredient.baseTerm}{#if ingredient.descriptors}
											({ingredient.descriptors}){/if}</option
									>
								{/each}
							</select>
						</label>
						<label>
							Quantity
							<input type="number" name="quantityValue" step="any" min="0" required />
						</label>
						<label>
							Unit
							<input type="text" name="quantityUnit" placeholder="e.g. g, tsp" />
						</label>
						<label>
							Prep attribute
							<input type="text" name="prepAttribute" placeholder="e.g. diced, chilled" />
						</label>
						<label>
							Note
							<input type="text" name="note" />
						</label>
						<button type="submit">Add usage</button>
					</form>
				</details>
			</li>
		{/each}
	</ol>
{:else}
	<p>No steps yet.</p>
{/if}

<h2>Add a step</h2>

<form method="POST" action="?/addStep">
	<label>
		Instruction
		<textarea name="instruction" required maxlength="2000"></textarea>
	</label>

	<fieldset>
		<legend>Duration (optional)</legend>
		<label>
			Kind
			<select name="durationKind">
				<option value="">None</option>
				{#each data.durationKinds as kind (kind)}
					<option value={kind}>{kind}</option>
				{/each}
			</select>
		</label>
		<label>
			Min
			<input type="number" name="durationMin" step="any" min="0" />
		</label>
		<label>
			Max
			<input type="number" name="durationMax" step="any" min="0" />
		</label>
		<label>
			Unit
			<input type="text" name="durationUnit" placeholder="e.g. minutes" />
		</label>
	</fieldset>

	<button type="submit">Add step</button>
</form>

<h2>Whole-recipe ingredient list</h2>

{#if allUsages.length > 0}
	<ul>
		{#each allUsages as usage (usage.id)}
			<li>
				{usage.ingredient.baseTerm}{#if usage.ingredient.descriptors}
					({usage.ingredient.descriptors}){/if} —
				{usage.displayQuantity}
				{#if usage.prepAttribute}, {usage.prepAttribute}{/if}
			</li>
		{/each}
	</ul>
{:else}
	<p>No ingredients yet.</p>
{/if}
