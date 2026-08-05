<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import ScalingFormulaEditor from '$lib/components/ScalingFormulaEditor.svelte';
	import { formatRemaining, parseDurationSeconds } from '$lib/duration';
	import { TimerStore } from '$lib/timers.svelte';

	let { data, form }: PageProps = $props();

	const allUsages = $derived(data.recipe.composition.steps.flatMap((step) => step.usages));
	const basePath = $derived(resolve('/recipes/[id]', { id: String(data.recipe.id) }));

	// Step timers: purely client-side (see docs/decisions.md) and scoped to
	// this page - one TimerStore is the single source of truth the badge,
	// panel, and each Step card all read from, keyed by compositionStepId
	// (unique per Step-as-rendered-in-this-Composition).
	const timers = new TimerStore();
	$effect(() => {
		const id = setInterval(() => timers.tick(), 250);
		return () => clearInterval(id);
	});
	let timerPanelOpen = $state(false);
</script>

<h1>{data.recipe.title}</h1>

<nav>
	<ul>
		{#each data.recipe.compositions as composition (composition.id)}
			<li>
				<a
					href="{basePath}?composition={composition.id}&servings={data.recipe.targetServings}"
					aria-current={composition.id === data.recipe.composition.id ? 'page' : undefined}
				>
					{composition.name ?? 'Default'}
				</a>
			</li>
		{/each}
	</ul>
</nav>

<h2>Servings</h2>

{#if form?.servingsError}
	<p role="alert">{form.servingsError}</p>
{/if}

<form method="GET">
	<input type="hidden" name="composition" value={data.recipe.composition.id} />
	<label>
		Viewing at
		<input type="number" name="servings" min="1" step="1" value={data.recipe.targetServings} />
		servings
	</label>
	<button type="submit">Update</button>
</form>

<details>
	<summary>This recipe's usual servings ({data.recipe.servings})</summary>
	<p>
		Every stored quantity and duration is written "as usual" at this count - viewing at a different
		count above recomputes from this baseline.
	</p>
	<form method="POST" action="?/updateServings">
		<label>
			Usual servings
			<input type="number" name="servings" min="1" step="1" value={data.recipe.servings} required />
		</label>
		<button type="submit">Update usual servings</button>
	</form>
</details>

<p>
	<button type="button" onclick={() => (timerPanelOpen = !timerPanelOpen)}>
		⏱ Timers ({timers.activeCount})
	</button>
</p>

{#if timerPanelOpen}
	<section aria-label="Active timers">
		<h2>Timers</h2>
		{#if timers.sorted.length > 0}
			<ul>
				{#each timers.sorted as timer (timer.id)}
					<li>
						<span>{timer.label}</span>
						{#if timers.isDone(timer)}
							<strong>Done ✓</strong>
						{:else}
							<span>{formatRemaining(timers.remaining(timer))} remaining</span>
							<button type="button" onclick={() => timers.finish(timer.id)}>Finish</button>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p>No timers running.</p>
		{/if}
	</section>
{/if}

<h2>Steps</h2>

{#if form?.stepError}
	<p role="alert">{form.stepError}</p>
{/if}
{#if form?.usageError}
	<p role="alert">{form.usageError}</p>
{/if}
{#if form?.scalingError}
	<p role="alert">{form.scalingError}</p>
{/if}

{#if data.recipe.composition.steps.length > 0}
	<ol>
		{#each data.recipe.composition.steps as step (step.compositionStepId)}
			<li>
				<p>
					{step.renderedInstruction}{#if step.isOverride}<em>
							(overridden in this composition)</em
						>{/if}
				</p>
				{#if step.durationKind}
					<p>
						<em
							>{step.durationKind}: {step.scaledDurationMin}{#if step.scaledDurationMax}–{step.scaledDurationMax}{/if}
							{step.durationUnit}
							{#if step.durationScalingFormula}(scaling rule set){/if}</em
						>
					</p>
					<ScalingFormulaEditor
						action="?/setDurationScalingFormula"
						idFieldName="stepId"
						idFieldValue={step.id}
						allowVsOtherUsage={true}
						otherUsageOptions={step.usages.map((usage) => ({
							id: usage.id,
							label: `${usage.ingredient.baseTerm}${usage.ingredient.descriptors ? ` (${usage.ingredient.descriptors})` : ''}`,
							baseQuantity: usage.quantityValue
						}))}
						currentFormula={step.durationScalingFormula}
						baseValue={step.durationMin ?? 0}
						baseServings={data.recipe.servings}
						unit={step.durationUnit ?? ''}
						noneLabel="stay constant, unaffected by servings (default)"
					/>
					{@const timerSeconds = parseDurationSeconds(
						step.durationMin ?? 0,
						step.durationUnit ?? ''
					)}
					{#if timerSeconds}
						{@const timerId = String(step.compositionStepId)}
						{@const timer = timers.get(timerId)}
						<p>
							{#if timer && !timers.isDone(timer)}
								<span>{formatRemaining(timers.remaining(timer))} remaining</span>
								<button type="button" onclick={() => timers.finish(timerId)}>Finish timer</button>
							{:else}
								{#if timer}
									<strong>Timer done ✓</strong>
								{/if}
								<button
									type="button"
									onclick={() => timers.start(timerId, step.renderedInstruction, timerSeconds)}
								>
									{timer ? 'Restart timer' : 'Start timer'}
								</button>
							{/if}
						</p>
					{/if}
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
								{#if usage.alternativeIngredient}
									<span>
										— alternative: {usage.alternativeIngredient
											.baseTerm}{#if usage.alternativeIngredient.descriptors}
											({usage.alternativeIngredient.descriptors}){/if}
									</span>
								{/if}
								{#if usage.note}<span>— {usage.note}</span>{/if}
								{#if usage.scalingFormula}<span> (scaling rule set)</span>{/if}
								<ScalingFormulaEditor
									action="?/setUsageScalingFormula"
									idFieldName="ingredientUsageId"
									idFieldValue={usage.id}
									allowVsOtherUsage={false}
									currentFormula={usage.scalingFormula}
									baseValue={usage.quantityValue}
									baseServings={data.recipe.servings}
									unit={usage.quantityUnit}
									noneLabel="scale exactly with servings (default)"
								/>

								<details>
									<summary
										>{usage.alternativeIngredient ? 'Change' : 'Add'} alternative ingredient</summary
									>
									<form method="POST" action="?/setUsageAlternative">
										<input type="hidden" name="usageId" value={usage.id} />
										<label>
											Alternative ingredient
											<select name="alternativeIngredientId">
												<option value="">None</option>
												{#each data.ingredients as ingredient (ingredient.id)}
													<option
														value={ingredient.id}
														selected={ingredient.id === usage.alternativeIngredient?.id}
														>{ingredient.baseTerm}{#if ingredient.descriptors}
															({ingredient.descriptors}){/if}</option
													>
												{/each}
											</select>
										</label>
										<button type="submit">Save alternative</button>
									</form>
								</details>
							</li>
						{/each}
					</ul>
				{/if}

				<details>
					<summary>
						{step.isOverride
							? 'Edit instruction (this composition only)'
							: 'Edit instruction (shared - updates every composition)'}
					</summary>
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
					<summary>Override in this composition only</summary>
					<form method="POST" action="?/overrideStep">
						<input type="hidden" name="compositionStepId" value={step.compositionStepId} />
						<label>
							Instruction
							<textarea name="instruction" required maxlength="2000">{step.instruction}</textarea>
						</label>
						<fieldset>
							<legend>Duration (optional)</legend>
							<label>
								Kind
								<select name="durationKind">
									<option value="">None</option>
									{#each data.durationKinds as kind (kind)}
										<option value={kind} selected={kind === step.durationKind}>{kind}</option>
									{/each}
								</select>
							</label>
							<label>
								Min
								<input
									type="number"
									name="durationMin"
									step="any"
									min="0"
									value={step.durationMin}
								/>
							</label>
							<label>
								Max
								<input
									type="number"
									name="durationMax"
									step="any"
									min="0"
									value={step.durationMax}
								/>
							</label>
							<label>
								Unit
								<input type="text" name="durationUnit" value={step.durationUnit ?? ''} />
							</label>
						</fieldset>
						<button type="submit">Override step</button>
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
							Alternative ingredient (optional)
							<select name="alternativeIngredientId">
								<option value="">None</option>
								{#each data.ingredients as ingredient (ingredient.id)}
									<option value={ingredient.id}
										>{ingredient.baseTerm}{#if ingredient.descriptors}
											({ingredient.descriptors}){/if}</option
									>
								{/each}
							</select>
						</label>
						<label>
							Note
							<input type="text" name="note" />
						</label>
						<button type="submit">Add usage</button>
					</form>
				</details>

				<form method="POST" action="?/removeStep">
					<input type="hidden" name="compositionStepId" value={step.compositionStepId} />
					{#if step.otherCompositionsReferencing.length > 0}
						<p role="alert">
							Warning: this step is also used by
							{step.otherCompositionsReferencing.map((c) => c.name ?? 'Default').join(', ')}. It
							will stay there unless you also check it off below.
						</p>
						<p>
							Also drop it from:
							{#each step.otherCompositionsReferencing as other (other.id)}
								<label>
									<input type="checkbox" name="alsoFromCompositionIds" value={other.id} />
									{other.name ?? 'Default'}
								</label>
							{/each}
						</p>
					{/if}
					<button type="submit">Remove step from this composition</button>
				</form>
			</li>
		{/each}
	</ol>
{:else}
	<p>No steps yet.</p>
{/if}

<h2>Add a step</h2>

<form method="POST" action="?/addStep">
	<input type="hidden" name="compositionId" value={data.recipe.composition.id} />
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

<h2>Variants</h2>

{#if form?.variantError}
	<p role="alert">{form.variantError}</p>
{/if}

<form method="POST" action="?/createVariant">
	<label>
		Name
		<input type="text" name="name" required maxlength="80" placeholder="e.g. Chilli sin carne" />
	</label>
	<label>
		Seed from
		<select name="seedFromCompositionId">
			{#each data.recipe.compositions as composition (composition.id)}
				<option value={composition.id} selected={composition.id === data.recipe.composition.id}>
					{composition.name ?? 'Default'}
				</option>
			{/each}
		</select>
	</label>
	<button type="submit">Create variant</button>
</form>

<h2>Whole-composition ingredient list</h2>

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
