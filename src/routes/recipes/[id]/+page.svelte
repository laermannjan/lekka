<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';
	import ScalingFormulaEditor from '$lib/components/ScalingFormulaEditor.svelte';
	import { formatRemaining, parseDurationSeconds } from '$lib/duration';
	import { TimerStore } from '$lib/timers.svelte';
	import {
		cancelTimerPush,
		isPushSupported,
		isSubscribed,
		scheduleTimerPush,
		subscribeToPush
	} from '$lib/push';

	let { data, form }: PageProps = $props();

	const allUsages = $derived(data.recipe.composition.steps.flatMap((step) => step.usages));
	const basePath = $derived(resolve('/recipes/[id]', { id: String(data.recipe.id) }));

	// Step timers: purely client-side countdown (see docs/decisions.md),
	// scoped to this page - one TimerStore is the single source of truth
	// the badge, panel, and each Step card all read from, keyed by
	// compositionStepId (unique per Step-as-rendered-in-this-Composition).
	// The server-side Web Push fallback (see issue #27) is scheduled
	// alongside each start/finish below so a timer still notifies while the
	// phone is locked or the tab is backgrounded, but never replaces this
	// countdown as the source of truth.
	const timers = new TimerStore();
	$effect(() => {
		const id = setInterval(() => timers.tick(), 250);
		return () => clearInterval(id);
	});
	let timerPanelOpen = $state(false);
	let pushSupported = $state(false);
	let notificationsEnabled = $state(false);
	$effect(() => {
		pushSupported = isPushSupported();
		notificationsEnabled = isSubscribed();
	});

	async function enableNotifications() {
		notificationsEnabled = await subscribeToPush();
	}

	function startTimer(timerId: string, label: string, durationSec: number) {
		timers.start(timerId, label, durationSec);
		void scheduleTimerPush(timerId, 'Timer done', label, Date.now() + durationSec * 1000);
	}

	function finishTimer(timerId: string) {
		timers.finish(timerId);
		void cancelTimerPush(timerId);
	}

	const categoryGroupLabels: Record<string, string> = {
		'meal-type': 'Meal type',
		cuisine: 'Cuisine',
		course: 'Course'
	};
	const attachedCategoryIds = $derived(new Set(data.recipeCategories.map((c) => c.id)));
	const availableCategories = $derived(
		data.categories.filter((c) => !attachedCategoryIds.has(c.id))
	);
	const availableCollections = $derived(
		data.collections.filter((c) => !data.recipeCollections.some((rc) => rc.id === c.id))
	);
</script>

<h1>{data.recipe.title}</h1>

{#if data.diners.length > 0}
	<p>
		<em
			>Diners: {data.diners.map((d) => d.name).join(', ')} —
			<a href={resolve('/profile')}>change</a></em
		>
	</p>
{/if}

<section>
	{#if form?.favoriteError}
		<p role="alert">{form.favoriteError}</p>
	{/if}
	<form method="POST" action="?/toggleFavorite">
		<input type="hidden" name="isFavorite" value={data.isFavorite} />
		<button type="submit" aria-pressed={data.isFavorite}>
			{data.isFavorite ? '★ Favorited' : '☆ Mark as favorite'}
		</button>
	</form>
	<!-- A Favorite is yours to set but visible household-wide (see CONTEXT.md's
	     Favorite), so show everyone who marked it, not just the acting Profile. -->
	{#if data.favoritedBy.length > 0}
		<p><em>Favorited by {data.favoritedBy.map((p) => p.name).join(', ')}.</em></p>
	{/if}
</section>

<section>
	<h2>Categories</h2>
	{#if form?.categoryError}
		<p role="alert">{form.categoryError}</p>
	{/if}

	{#if data.recipeCategories.length > 0}
		<ul>
			{#each data.recipeCategories as category (category.id)}
				<li>
					{category.name} <em>({categoryGroupLabels[category.categoryGroup]})</em>
					<form method="POST" action="?/removeCategory" style="display: inline">
						<input type="hidden" name="categoryId" value={category.id} />
						<button type="submit">Remove</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p>No categories yet.</p>
	{/if}

	{#if availableCategories.length > 0}
		<form method="POST" action="?/addCategory">
			<label>
				Attach an existing category
				<select name="categoryId">
					{#each Object.entries(categoryGroupLabels) as [group, label] (group)}
						{#each availableCategories.filter((c) => c.categoryGroup === group) as category (category.id)}
							<option value={category.id}>{label}: {category.name}</option>
						{/each}
					{/each}
				</select>
			</label>
			<button type="submit">Attach</button>
		</form>
	{/if}

	<details>
		<summary>Create a new category</summary>
		<form method="POST" action="?/createCategory">
			<label>
				Name
				<input type="text" name="name" required maxlength="60" list="category-name-options" />
			</label>
			<datalist id="category-name-options">
				{#each data.categories as category (category.id)}
					<option value={category.name}></option>
				{/each}
			</datalist>
			<label>
				Group
				<select name="categoryGroup" required>
					{#each data.categoryGroups as group (group)}
						<option value={group}>{categoryGroupLabels[group]}</option>
					{/each}
				</select>
			</label>
			<button type="submit">Create and attach</button>
		</form>
	</details>
</section>

<section>
	<h2>Collections</h2>
	{#if form?.collectionError}
		<p role="alert">{form.collectionError}</p>
	{/if}

	{#if data.recipeCollections.length > 0}
		<ul>
			{#each data.recipeCollections as collection (collection.id)}
				<li>
					{collection.name}
					<form method="POST" action="?/removeFromCollection" style="display: inline">
						<input type="hidden" name="collectionId" value={collection.id} />
						<button type="submit">Remove</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p>Not in any collections yet.</p>
	{/if}

	{#if availableCollections.length > 0}
		<form method="POST" action="?/addToCollection">
			<label>
				Add to an existing collection
				<select name="collectionId">
					{#each availableCollections as collection (collection.id)}
						<option value={collection.id}>{collection.name}</option>
					{/each}
				</select>
			</label>
			<button type="submit">Add</button>
		</form>
	{/if}

	<details>
		<summary>Create a new collection</summary>
		<form method="POST" action="?/createCollection">
			<label>
				Name
				<input
					type="text"
					name="name"
					required
					maxlength="80"
					placeholder="e.g. weeknight dinners"
				/>
			</label>
			<button type="submit">Create and add</button>
		</form>
	</details>
</section>

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
	{#if pushSupported && !notificationsEnabled}
		<button type="button" onclick={enableNotifications}>Enable timer notifications</button>
	{:else if pushSupported}
		<em>Timer notifications enabled</em>
	{/if}
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
							<button type="button" onclick={() => finishTimer(timer.id)}>Finish</button>
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
								<button type="button" onclick={() => finishTimer(timerId)}>Finish timer</button>
							{:else}
								{#if timer}
									<strong>Timer done ✓</strong>
								{/if}
								<button
									type="button"
									onclick={() => startTimer(timerId, step.renderedInstruction, timerSeconds)}
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
							{@const flaggedTags = data.flaggedTagsByIngredientId[usage.ingredientId] ?? []}
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
								{#if flaggedTags.length > 0}
									<p role="alert">
										⚠ contains {flaggedTags.map((t) => t.name).join(', ')} — avoided by a selected diner.
										{#if usage.alternativeIngredient}
											Suggested swap: {usage.alternativeIngredient
												.baseTerm}{#if usage.alternativeIngredient.descriptors}
												({usage.alternativeIngredient.descriptors}){/if}.
										{:else}
											No alternative declared for this usage.
										{/if}
									</p>
								{/if}
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

<h2>Cook log</h2>

<p>Logging a cook records what happened, when, and by whom - it never edits this recipe itself.</p>

{#if form?.cookError}
	<p role="alert">{form.cookError}</p>
{/if}

{#if data.actingProfile}
	<details>
		<summary>Log a cook</summary>
		<form method="POST" action="?/logCook">
			<input type="hidden" name="compositionId" value={data.recipe.composition.id} />
			<label>
				Date
				<input type="date" name="cookedAt" required value={new Date().toISOString().slice(0, 10)} />
			</label>
			<label>
				Outcome
				<select name="outcome" required>
					{#each data.cookOutcomes as outcome (outcome)}
						<option value={outcome}>{outcome}</option>
					{/each}
				</select>
			</label>
			<label>
				Summary (optional)
				<textarea name="summary" maxlength="2000"></textarea>
			</label>
			<fieldset>
				<legend>Diners present</legend>
				{#each data.profiles as profile (profile.id)}
					<label>
						<input
							type="checkbox"
							name="dinerProfileIds"
							value={profile.id}
							checked={data.diners.some((d) => d.id === profile.id)}
						/>
						{profile.name}
					</label>
				{/each}
			</fieldset>
			<button type="submit">Log cook</button>
		</form>
	</details>
{:else}
	<p><em>Pick a profile to log a cook.</em></p>
{/if}

{#if form?.annotationError}
	<p role="alert">{form.annotationError}</p>
{/if}

{#if data.cooks.length > 0}
	<ol>
		{#each data.cooks as cook (cook.id)}
			{@const annotations = data.annotationsByCookId[cook.id] ?? []}
			<li>
				<p>
					<time datetime={cook.cookedAt}>{cook.cookedAt}</time> —
					{cook.outcome}
					{#if cook.actingProfile}by {cook.actingProfile.name}{/if}
					{#if cook.diners.length > 0}
						— diners: {cook.diners.map((d) => d.name).join(', ')}
					{/if}
				</p>
				{#if cook.summary}
					<p>{cook.summary}</p>
				{/if}

				{#if annotations.length > 0}
					<ul>
						{#each annotations as annotation (annotation.id)}
							<li>
								{#if annotation.stepId !== null}
									{@const step = data.recipe.composition.steps.find(
										(s) => s.id === annotation.stepId
									)}
									<em>Step: {step?.renderedInstruction ?? `#${annotation.stepId}`}</em> —
								{:else}
									{@const usage = allUsages.find((u) => u.id === annotation.ingredientUsageId)}
									<em
										>Usage: {usage
											? `${usage.ingredient.baseTerm}${usage.ingredient.descriptors ? ` (${usage.ingredient.descriptors})` : ''}`
											: `#${annotation.ingredientUsageId}`}</em
									> —
								{/if}
								{annotation.note}
							</li>
						{/each}
					</ul>
				{/if}

				<details>
					<summary>Add an annotation</summary>
					<form method="POST" action="?/addCookAnnotation">
						<input type="hidden" name="cookId" value={cook.id} />
						<p>Pin to exactly one of a step or an ingredient usage:</p>
						<label>
							Step
							<select name="stepId">
								<option value="">None</option>
								{#each data.recipe.composition.steps as step (step.id)}
									<option value={step.id}>{step.renderedInstruction}</option>
								{/each}
							</select>
						</label>
						<label>
							Or ingredient usage
							<select name="ingredientUsageId">
								<option value="">None</option>
								{#each allUsages as usage (usage.id)}
									<option value={usage.id}
										>{usage.ingredient.baseTerm}{#if usage.ingredient.descriptors}
											({usage.ingredient.descriptors}){/if}</option
									>
								{/each}
							</select>
						</label>
						<label>
							Note
							<textarea name="note" required maxlength="1000"></textarea>
						</label>
						<button type="submit">Add annotation</button>
					</form>
				</details>
			</li>
		{/each}
	</ol>
{:else}
	<p>No cooks logged yet.</p>
{/if}

<h2>Version history</h2>

{#if form?.versionError}
	<p role="alert">{form.versionError}</p>
{/if}

<p>
	Every edit to the step pool or any composition creates a new version on one shared timeline.
	Reverting restores the whole recipe - the pool and every composition - to that point.
</p>

<ol reversed>
	{#each data.versions as version (version.id)}
		<li value={version.number}>
			<time datetime={version.createdAt}>{version.createdAt}</time>
			{#if version.revertedFromVersionId !== null}
				<em>(reverted from an earlier version)</em>
			{/if}
			{#if version.number === data.versions[0].number}
				<strong>— current</strong>
			{:else}
				<form method="POST" action="?/revertToVersion">
					<input type="hidden" name="versionId" value={version.id} />
					<button type="submit">Revert to this version</button>
				</form>
			{/if}
		</li>
	{/each}
</ol>
