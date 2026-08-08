<!--
	PROTOTYPE — Variant C, "Cook Mode".
	Phone-first, one thing at a time. A narrow column of full-bleed step cards
	with type big enough to read at arm's length, a sticky bar holding servings
	and the running timers, and everything else (shopping list, history,
	variants) folded into disclosures. Optimised for standing at a hob with
	greasy hands, at the cost of ever showing you the whole recipe at once.
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
	let done = $state<Record<number, boolean>>({});
</script>

<div class="cookmode">
	<div class="sticky">
		<div class="bar">
			<div class="bar-title">
				<h1>{recipe.title}</h1>
				<span>{recipe.composition.name ?? 'Original'}</span>
			</div>
			<label class="serves">
				<span>serves</span>
				<select
					onchange={(e) => (location.href = viewUrl(search, { servings: e.currentTarget.value }))}
				>
					{#each SERVING_CHOICES as count (count)}
						<option value={count} selected={count === recipe.targetServings}>{count}</option>
					{/each}
				</select>
			</label>
		</div>

		{#if timers.sorted.length > 0}
			<div class="timer-strip">
				{#each timers.sorted as timer (timer.id)}
					<button
						type="button"
						class:finished={timers.isDone(timer)}
						onclick={() => timers.finish(timer.id)}
					>
						<b>{timers.isDone(timer) ? 'DONE' : formatRemaining(timers.remaining(timer))}</b>
						<span>{timer.label}</span>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<div class="sheets">
		<details>
			<summary>
				<span>Shopping list</span>
				<em>{lines.length} ingredients for {recipe.targetServings}</em>
			</summary>
			<ul class="shop">
				{#each lines as line (line.key)}
					{@const flagged = data.flaggedTagsByIngredientId[line.ingredient.id] ?? []}
					<li class:flagged={flagged.length > 0}>
						<b>{line.display}</b>
						<span>{ingredientLabel(line.ingredient)}</span>
						{#if flagged.length > 0}<i>{flagged.map((t) => t.name).join(', ')}</i>{/if}
					</li>
				{/each}
			</ul>
		</details>

		{#if recipe.compositions.length > 1}
			<details>
				<summary>
					<span>Versions of this dish</span>
					<em>{recipe.compositions.length}</em>
				</summary>
				<div class="variants">
					{#each recipe.compositions as composition (composition.id)}
						<a
							href={viewUrl(search, { composition: composition.id })}
							class:on={composition.id === recipe.composition.id}
							>{composition.name ?? 'Original'}</a
						>
					{/each}
				</div>
			</details>
		{/if}

		<details>
			<summary>
				<span>Cook history</span>
				<em>{data.cooks.length} times</em>
			</summary>
			<ul class="log">
				{#each data.cooks as cook (cook.id)}
					<li>
						<div>
							<b>{cook.cookedAt}</b>
							<span class="out {cook.outcome}">{OUTCOME_LABELS[cook.outcome]}</span>
							<span class="who"
								>{data.profiles.find((p) => p.id === cook.actingProfileId)?.name}</span
							>
						</div>
						{#if cook.summary}<p>{cook.summary}</p>{/if}
						{#each data.annotationsByCookId[cook.id] ?? [] as annotation (annotation.id)}
							<p class="ann">{annotation.note}</p>
						{/each}
					</li>
				{/each}
			</ul>
		</details>
	</div>

	<ol class="cards">
		{#each recipe.composition.steps as step, index (step.compositionStepId)}
			{@const label = durationLabel(step)}
			{@const timerId = String(step.compositionStepId)}
			{@const seconds =
				step.scaledDurationMin && step.durationUnit
					? parseDurationSeconds(step.scaledDurationMin, step.durationUnit)
					: null}
			{@const timer = timers.get(timerId)}
			<li class="card" class:struck={done[step.compositionStepId]}>
				<div class="card-top">
					<span class="n">Step {index + 1} of {recipe.composition.steps.length}</span>
					{#if label}
						<span class="time {step.durationKind}"
							>{label} · {DURATION_KIND_LABELS[step.durationKind ?? ''] ?? ''}</span
						>
					{/if}
				</div>

				{#if step.usages.length > 0}
					<ul class="chips">
						{#each step.usages as usage (usage.id)}
							{@const flagged = data.flaggedTagsByIngredientId[usage.ingredientId] ?? []}
							<li class:flagged={flagged.length > 0}>
								<b>{usage.displayQuantity}</b>
								{ingredientLabel(usage.ingredient)}
								{#if usage.prepAttribute}<i>{usage.prepAttribute}</i>{/if}
								{#if usage.alternativeIngredient}<i>or {usage.alternativeIngredient.baseTerm}</i
									>{/if}
							</li>
						{/each}
					</ul>
				{/if}

				<p class="instr">{step.renderedInstruction}</p>

				{#each step.usages.filter((u) => u.note) as usage (usage.id)}
					<p class="tip">{usage.note}</p>
				{/each}

				<div class="actions">
					{#if seconds}
						{#if timer && !timers.isDone(timer)}
							<button type="button" class="big running" onclick={() => timers.finish(timerId)}>
								{formatRemaining(timers.remaining(timer))}
							</button>
						{:else if timer}
							<button type="button" class="big finished" disabled>Timer done</button>
						{:else}
							<button
								type="button"
								class="big"
								onclick={() => timers.start(timerId, `Step ${index + 1}`, seconds)}
								>Start {label}</button
							>
						{/if}
					{/if}
					<button
						type="button"
						class="check"
						aria-pressed={done[step.compositionStepId] ?? false}
						onclick={() =>
							(done = { ...done, [step.compositionStepId]: !done[step.compositionStepId] })}
						>{done[step.compositionStepId] ? '✓ Done' : 'Mark done'}</button
					>
				</div>
			</li>
		{/each}
	</ol>
</div>

<style>
	.cookmode {
		--bg: #f4f1ec;
		--card: #ffffff;
		--ink: #1a1a1a;
		--dim: #6b6b6b;
		--accent: #1f6f4a;
		--hot: #c0442b;
		--edge: #e3ddd3;
		background: var(--bg);
		color: var(--ink);
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			sans-serif;
		min-height: 100vh;
		padding-bottom: 4rem;
	}

	.sticky {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--bg);
		border-bottom: 1px solid var(--edge);
	}
	.bar {
		max-width: 34rem;
		margin: 0 auto;
		padding: 0.7rem 1rem;
		display: flex;
		align-items: center;
		gap: 1rem;
	}
	.bar-title {
		min-width: 0;
	}
	h1 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.bar-title span {
		font-size: 0.75rem;
		color: var(--dim);
	}
	.serves {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: var(--dim);
	}
	.serves select {
		font: inherit;
		font-size: 1.05rem;
		font-weight: 700;
		color: var(--ink);
		padding: 0.35rem 0.5rem;
		border: 2px solid var(--ink);
		border-radius: 10px;
		background: var(--card);
	}

	.timer-strip {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding: 0 1rem 0.7rem;
		max-width: 34rem;
		margin: 0 auto;
	}
	.timer-strip button {
		flex: none;
		font: inherit;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.05rem;
		background: var(--hot);
		color: #fff;
		border: 0;
		border-radius: 12px;
		padding: 0.45rem 0.8rem;
		cursor: pointer;
	}
	.timer-strip button.finished {
		background: var(--accent);
	}
	.timer-strip b {
		font-size: 1.1rem;
		font-variant-numeric: tabular-nums;
	}
	.timer-strip span {
		font-size: 0.68rem;
		opacity: 0.85;
	}

	.sheets {
		max-width: 34rem;
		margin: 0.9rem auto 0;
		padding: 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	details {
		background: var(--card);
		border: 1px solid var(--edge);
		border-radius: 14px;
		overflow: hidden;
	}
	summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.85rem 1rem;
		cursor: pointer;
		font-weight: 600;
		font-size: 0.95rem;
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
	summary::after {
		content: '＋';
		margin-left: auto;
		color: var(--dim);
		font-weight: 400;
	}
	details[open] summary::after {
		content: '−';
	}
	summary em {
		font-style: normal;
		font-weight: 400;
		font-size: 0.8rem;
		color: var(--dim);
	}

	.shop {
		list-style: none;
		margin: 0;
		padding: 0 1rem 0.8rem;
	}
	.shop li {
		display: flex;
		gap: 0.6rem;
		align-items: baseline;
		padding: 0.5rem 0;
		border-top: 1px solid var(--edge);
		font-size: 0.95rem;
	}
	.shop b {
		min-width: 5rem;
		font-variant-numeric: tabular-nums;
	}
	.shop i,
	.chips i {
		font-style: normal;
		font-size: 0.78rem;
		color: var(--dim);
	}
	.shop li.flagged,
	.chips li.flagged {
		color: var(--hot);
	}

	.variants {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding: 0 1rem 1rem;
	}
	.variants a {
		padding: 0.5rem 0.9rem;
		border: 1px solid var(--edge);
		border-radius: 999px;
		text-decoration: none;
		color: var(--ink);
		font-size: 0.9rem;
	}
	.variants a.on {
		background: var(--ink);
		color: #fff;
		border-color: var(--ink);
	}

	.log {
		list-style: none;
		margin: 0;
		padding: 0 1rem 0.8rem;
	}
	.log li {
		padding: 0.6rem 0;
		border-top: 1px solid var(--edge);
	}
	.log li > div {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
	}
	.out {
		border-radius: 999px;
		padding: 0.05rem 0.5rem;
		font-size: 0.72rem;
		background: #eee;
	}
	.out.worked-well {
		background: #dcecdf;
		color: var(--accent);
	}
	.out.needs-tweaks {
		background: #f6e6cd;
		color: #8a5f1d;
	}
	.who {
		margin-left: auto;
		color: var(--dim);
	}
	.log p {
		margin: 0.35rem 0 0;
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.ann {
		color: var(--dim);
		border-left: 2px solid var(--edge);
		padding-left: 0.6rem;
	}

	.cards {
		list-style: none;
		max-width: 34rem;
		margin: 1.2rem auto 0;
		padding: 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		counter-reset: step;
	}
	.card {
		background: var(--card);
		border: 1px solid var(--edge);
		border-radius: 18px;
		padding: 1.1rem 1.1rem 1rem;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
	}
	.card.struck {
		opacity: 0.5;
	}
	.card-top {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin-bottom: 0.7rem;
	}
	.n {
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim);
		font-weight: 600;
	}
	.time {
		margin-left: auto;
		font-size: 0.78rem;
		font-weight: 600;
		border-radius: 999px;
		padding: 0.15rem 0.6rem;
		background: #eef1ee;
		color: var(--accent);
	}
	.time.wait {
		background: #eaeef6;
		color: #3b5b96;
	}
	.time.cook {
		background: #f8ecdf;
		color: #96562a;
	}

	.chips {
		list-style: none;
		margin: 0 0 0.8rem;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}
	.chips li {
		background: #f3f0ea;
		border-radius: 8px;
		padding: 0.3rem 0.6rem;
		font-size: 0.85rem;
	}
	.chips b {
		font-variant-numeric: tabular-nums;
	}
	.chips li.flagged {
		background: #fbe8e4;
	}

	.instr {
		margin: 0;
		font-size: 1.22rem;
		line-height: 1.45;
	}
	.tip {
		margin: 0.7rem 0 0;
		font-size: 0.85rem;
		color: var(--dim);
		background: #f7f5f0;
		border-radius: 10px;
		padding: 0.5rem 0.7rem;
	}

	.actions {
		display: flex;
		gap: 0.6rem;
		margin-top: 1rem;
	}
	.big {
		flex: 1;
		font: inherit;
		font-size: 1rem;
		font-weight: 700;
		padding: 0.85rem 1rem;
		border-radius: 12px;
		border: 0;
		background: var(--ink);
		color: #fff;
		cursor: pointer;
	}
	.big.running {
		background: var(--hot);
		font-variant-numeric: tabular-nums;
		font-size: 1.35rem;
	}
	.big.finished {
		background: var(--accent);
	}
	.check {
		font: inherit;
		font-size: 0.88rem;
		padding: 0.85rem 1rem;
		border-radius: 12px;
		border: 1px solid var(--edge);
		background: transparent;
		color: var(--dim);
		cursor: pointer;
	}
	.check[aria-pressed='true'] {
		background: var(--accent);
		border-color: var(--accent);
		color: #fff;
	}
</style>
