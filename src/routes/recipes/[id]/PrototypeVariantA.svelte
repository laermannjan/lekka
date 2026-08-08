<!--
	PROTOTYPE — Variant A, "Kitchen Counter".
	Editorial and warm. Sticky left rail holds the two things you look at
	repeatedly (servings, the whole ingredient list); the right column is a
	single readable column of steps. Optimised for reading a recipe you have
	already decided to cook. Read-only: servings and Variant are links.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { formatRemaining, parseDurationSeconds } from '$lib/duration';
	import { TimerStore } from '$lib/timers.svelte';
	import type { PageData } from './$types';
	import {
		DURATION_KIND_LABELS,
		OUTCOME_LABELS,
		SERVING_CHOICES,
		aggregateIngredients,
		durationLabel,
		ingredientLabel,
		viewUrl
	} from './prototype-shared';

	let { data, timers }: { data: PageData; timers: TimerStore } = $props();

	const recipe = $derived(data.recipe);
	const lines = $derived(aggregateIngredients(recipe.composition.steps));
	const search = $derived(page.url.searchParams);
	const totalActive = $derived(
		recipe.composition.steps
			.filter((s) => s.durationKind === 'active' && s.scaledDurationMin)
			.reduce((sum, s) => sum + (s.scaledDurationMin ?? 0), 0)
	);
</script>

<div class="counter">
	<header class="masthead">
		<div class="masthead-text">
			<p class="kicker">
				{#each data.recipeCategories as category, i (category.id)}{i > 0
						? ' · '
						: ''}{category.name}{/each}
			</p>
			<h1>{recipe.title}</h1>
			<p class="standfirst">
				{recipe.composition.steps.length} steps · {lines.length} ingredients
				{#if totalActive > 0}· about {totalActive} minutes hands on{/if}
			</p>
		</div>
		<div class="masthead-marks">
			{#if data.favoritedBy.length > 0}
				<span class="mark">★ {data.favoritedBy.map((p) => p.name).join(', ')}</span>
			{/if}
			{#each data.recipeCollections as collection (collection.id)}
				<span class="mark quiet">{collection.name}</span>
			{/each}
		</div>
	</header>

	{#if recipe.compositions.length > 1}
		<nav class="lines" aria-label="Compositions">
			{#each recipe.compositions as composition (composition.id)}
				<a
					href={viewUrl(search, { composition: composition.id })}
					class:current={composition.id === recipe.composition.id}
				>
					{composition.name ?? 'Original'}
				</a>
			{/each}
		</nav>
	{/if}

	<div class="body">
		<aside class="rail">
			<section class="dial">
				<h2>Serves</h2>
				<div class="dial-row">
					{#each SERVING_CHOICES as count (count)}
						<a
							href={viewUrl(search, { servings: count })}
							class:current={count === recipe.targetServings}>{count}</a
						>
					{/each}
				</div>
				{#if recipe.targetServings !== recipe.servings}
					<p class="dial-note">Written for {recipe.servings}. Everything below is recomputed.</p>
				{/if}
			</section>

			<section class="shopping">
				<h2>Ingredients</h2>
				<ul>
					{#each lines as line (line.key)}
						{@const flagged = data.flaggedTagsByIngredientId[line.ingredient.id] ?? []}
						<li class:flagged={flagged.length > 0}>
							<span class="qty">{line.display}</span>
							<span class="name">
								{ingredientLabel(line.ingredient)}
								{#if line.usages.length > 1}<em class="times">×{line.usages.length}</em>{/if}
							</span>
							{#if flagged.length > 0}
								<span class="warn">avoid: {flagged.map((t) => t.name).join(', ')}</span>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		</aside>

		<main class="steps">
			{#each recipe.composition.steps as step, index (step.compositionStepId)}
				{@const label = durationLabel(step)}
				{@const timerId = String(step.compositionStepId)}
				{@const seconds =
					step.scaledDurationMin && step.durationUnit
						? parseDurationSeconds(step.scaledDurationMin, step.durationUnit)
						: null}
				{@const timer = timers.get(timerId)}
				<article class="step">
					<div class="step-index">{index + 1}</div>
					<div class="step-body">
						{#if label}
							<p class="step-time">
								<strong>{label}</strong>
								<span>{DURATION_KIND_LABELS[step.durationKind ?? ''] ?? step.durationKind}</span>
								{#if step.durationScalingFormula}<span class="rule">scaled</span>{/if}
							</p>
						{/if}
						<p class="instruction">{step.renderedInstruction}</p>

						{#if step.usages.length > 0}
							<ul class="step-usages">
								{#each step.usages as usage (usage.id)}
									{@const flagged = data.flaggedTagsByIngredientId[usage.ingredientId] ?? []}
									<li class:flagged={flagged.length > 0}>
										<b>{usage.displayQuantity}</b>
										{ingredientLabel(usage.ingredient)}{#if usage.prepAttribute}, {usage.prepAttribute}{/if}
										{#if usage.scalingFormula}<span class="rule">rule</span>{/if}
										{#if usage.alternativeIngredient}
											<span class="alt">or {ingredientLabel(usage.alternativeIngredient)}</span>
										{/if}
										{#if usage.note}<span class="note">{usage.note}</span>{/if}
									</li>
								{/each}
							</ul>
						{/if}

						{#if seconds}
							<div class="step-timer">
								{#if timer && !timers.isDone(timer)}
									<span class="running">{formatRemaining(timers.remaining(timer))}</span>
									<button type="button" onclick={() => timers.finish(timerId)}>Stop</button>
								{:else if timer}
									<span class="done">Done</span>
								{:else}
									<button
										type="button"
										class="start"
										onclick={() =>
											timers.start(timerId, step.renderedInstruction.slice(0, 40), seconds)}
										>Start {label}</button
									>
								{/if}
							</div>
						{/if}

						{#if step.isOverride}
							<p class="override">Changed for this variant</p>
						{/if}
					</div>
				</article>
			{/each}
		</main>
	</div>

	<section class="history">
		<h2>Cooked {data.cooks.length} times</h2>
		<ol>
			{#each data.cooks as cook (cook.id)}
				<li>
					<div class="cook-head">
						<span class="cook-date">{cook.cookedAt}</span>
						<span class="cook-outcome {cook.outcome}">{OUTCOME_LABELS[cook.outcome]}</span>
						<span class="cook-who"
							>{data.profiles.find((p) => p.id === cook.actingProfileId)?.name}</span
						>
					</div>
					{#if cook.summary}<p>{cook.summary}</p>{/if}
					{#each data.annotationsByCookId[cook.id] ?? [] as annotation (annotation.id)}
						<p class="annotation">{annotation.note}</p>
					{/each}
				</li>
			{/each}
		</ol>
	</section>
</div>

<style>
	.counter {
		--ink: #23201c;
		--ink-soft: #6f675d;
		--paper: #fbf7f0;
		--rule: #e2d9cb;
		--accent: #a2452b;
		max-width: 74rem;
		margin: 0 auto;
		padding: 2.5rem 1.5rem 6rem;
		background: var(--paper);
		color: var(--ink);
		font-family: 'Iowan Old Style', 'Palatino Linotype', Georgia, serif;
		line-height: 1.55;
	}

	.masthead {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: 2rem;
		border-bottom: 2px solid var(--ink);
		padding-bottom: 1.25rem;
	}
	.kicker {
		margin: 0;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--accent);
	}
	h1 {
		margin: 0.2rem 0 0.35rem;
		font-size: clamp(2.4rem, 6vw, 3.6rem);
		line-height: 1.02;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.standfirst {
		margin: 0;
		color: var(--ink-soft);
		font-size: 1rem;
	}
	.masthead-marks {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.3rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.78rem;
	}
	.mark {
		color: var(--accent);
	}
	.mark.quiet {
		color: var(--ink-soft);
	}

	.lines {
		display: flex;
		gap: 1.5rem;
		padding: 0.9rem 0;
		border-bottom: 1px solid var(--rule);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.9rem;
	}
	.lines a {
		color: var(--ink-soft);
		text-decoration: none;
		padding-bottom: 0.2rem;
		border-bottom: 2px solid transparent;
	}
	.lines a.current {
		color: var(--ink);
		border-bottom-color: var(--accent);
		font-weight: 600;
	}

	.body {
		display: grid;
		grid-template-columns: 17rem 1fr;
		gap: 3.5rem;
		align-items: start;
		margin-top: 2.25rem;
	}
	@media (max-width: 60rem) {
		.body {
			grid-template-columns: 1fr;
			gap: 2rem;
		}
	}

	.rail {
		position: sticky;
		top: 1.5rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.rail h2 {
		margin: 0 0 0.6rem;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-soft);
		font-weight: 600;
	}
	.dial-row {
		display: flex;
		border: 1px solid var(--rule);
		border-radius: 999px;
		overflow: hidden;
		background: #fff;
	}
	.dial-row a {
		flex: 1;
		text-align: center;
		padding: 0.45rem 0;
		text-decoration: none;
		color: var(--ink-soft);
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums;
	}
	.dial-row a.current {
		background: var(--ink);
		color: var(--paper);
		font-weight: 600;
	}
	.dial-note {
		margin: 0.5rem 0 0;
		font-size: 0.75rem;
		color: var(--accent);
	}

	.shopping {
		margin-top: 2rem;
	}
	.shopping ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.shopping li {
		display: grid;
		grid-template-columns: 4.6rem 1fr;
		gap: 0.5rem;
		padding: 0.42rem 0;
		border-bottom: 1px dotted var(--rule);
		font-size: 0.86rem;
	}
	.shopping .qty {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}
	.shopping .times {
		color: var(--ink-soft);
		font-size: 0.75rem;
	}
	.shopping .warn,
	.step-usages .flagged {
		color: #9a2b2b;
	}
	.shopping .warn {
		grid-column: 2;
		font-size: 0.72rem;
	}

	.step {
		display: grid;
		grid-template-columns: 3rem 1fr;
		gap: 1.25rem;
		padding: 1.6rem 0;
		border-bottom: 1px solid var(--rule);
	}
	.step-index {
		font-size: 2rem;
		line-height: 1;
		color: var(--rule);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.step-time {
		margin: 0 0 0.4rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.74rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ink-soft);
		display: flex;
		gap: 0.5rem;
		align-items: baseline;
	}
	.step-time strong {
		color: var(--accent);
	}
	.rule {
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		border: 1px solid var(--rule);
		border-radius: 3px;
		padding: 0 0.25rem;
		color: var(--ink-soft);
	}
	.instruction {
		margin: 0;
		font-size: 1.18rem;
	}
	.step-usages {
		list-style: none;
		margin: 0.9rem 0 0;
		padding: 0.7rem 0 0;
		border-top: 1px dotted var(--rule);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.84rem;
		color: var(--ink-soft);
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
	}
	.step-usages b {
		color: var(--ink);
		font-variant-numeric: tabular-nums;
	}
	.alt {
		font-style: italic;
	}
	.note {
		display: block;
		font-size: 0.78rem;
		font-style: italic;
	}
	.step-timer {
		margin-top: 0.9rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-family: ui-sans-serif, system-ui, sans-serif;
	}
	.step-timer button {
		font: inherit;
		font-size: 0.82rem;
		padding: 0.4rem 0.9rem;
		border-radius: 999px;
		border: 1px solid var(--ink);
		background: transparent;
		color: var(--ink);
		cursor: pointer;
	}
	.step-timer button.start:hover {
		background: var(--ink);
		color: var(--paper);
	}
	.running {
		font-variant-numeric: tabular-nums;
		font-weight: 700;
		color: var(--accent);
		font-size: 1.1rem;
	}
	.override {
		margin: 0.7rem 0 0;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--accent);
	}

	.history {
		margin-top: 3.5rem;
		border-top: 2px solid var(--ink);
		padding-top: 1.5rem;
	}
	.history h2 {
		margin: 0 0 1rem;
		font-size: 1.4rem;
		font-weight: 600;
	}
	.history ol {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
		gap: 1.25rem;
	}
	.history li {
		background: #fff;
		border: 1px solid var(--rule);
		border-radius: 4px;
		padding: 0.9rem 1rem;
	}
	.cook-head {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 0.76rem;
		color: var(--ink-soft);
		margin-bottom: 0.4rem;
	}
	.cook-date {
		font-variant-numeric: tabular-nums;
	}
	.cook-outcome {
		padding: 0.05rem 0.4rem;
		border-radius: 3px;
		background: #eee9df;
	}
	.cook-outcome.worked-well {
		background: #dfe9dc;
		color: #38562f;
	}
	.cook-outcome.needs-tweaks {
		background: #f4e6cf;
		color: #7a5620;
	}
	.cook-who {
		margin-left: auto;
	}
	.history p {
		margin: 0.3rem 0 0;
		font-size: 0.92rem;
	}
	.annotation {
		border-left: 2px solid var(--rule);
		padding-left: 0.6rem;
		font-style: italic;
		color: var(--ink-soft);
		font-size: 0.86rem !important;
	}
</style>
