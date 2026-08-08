<!--
	PROTOTYPE — Variant B, "Workbench".
	Dense, dark, tool-shaped. Everything that is *state* lives in one toolbar
	at the top; steps are a compact table you scan rather than read; the right
	pane is a tabbed inspector so ingredients, history and versions share one
	slot instead of stacking down the page. Optimised for authoring and for
	comparing Variants, not for reading over a hob.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { formatRemaining, parseDurationSeconds } from '$lib/duration';
	import { TimerStore } from '$lib/timers.svelte';
	import type { PageData } from './$types';
	import {
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

	const PANES = ['ingredients', 'history', 'versions', 'meta'] as const;
	let pane = $state<(typeof PANES)[number]>('ingredients');
	let selectedStep = $state<number | null>(null);
</script>

<div class="workbench">
	<div class="toolbar">
		<div class="title">
			<span class="crumb">Recipes /</span>
			<h1>{recipe.title}</h1>
			{#if data.favoritedBy.length > 0}<span
					class="star"
					title={data.favoritedBy.map((p) => p.name).join(', ')}>★ {data.favoritedBy.length}</span
				>{/if}
		</div>

		<div class="controls">
			<div class="seg" role="group" aria-label="Composition">
				{#each recipe.compositions as composition (composition.id)}
					<a
						href={viewUrl(search, { composition: composition.id })}
						class:on={composition.id === recipe.composition.id}>{composition.name ?? 'default'}</a
					>
				{/each}
			</div>

			<div class="seg servings" role="group" aria-label="Servings">
				<span class="seg-label">serves</span>
				{#each SERVING_CHOICES as count (count)}
					<a href={viewUrl(search, { servings: count })} class:on={count === recipe.targetServings}
						>{count}</a
					>
				{/each}
			</div>

			<span class="baseline" class:changed={recipe.targetServings !== recipe.servings}>
				base {recipe.servings} → {recipe.targetServings}
			</span>

			{#if timers.activeCount > 0}
				<span class="timer-badge">⏱ {timers.activeCount}</span>
			{/if}
		</div>
	</div>

	<div class="panes">
		<div class="steps-pane">
			<table>
				<thead>
					<tr>
						<th class="c-n">#</th>
						<th class="c-time">time</th>
						<th>instruction</th>
						<th class="c-ing">ingredients</th>
						<th class="c-act"></th>
					</tr>
				</thead>
				<tbody>
					{#each recipe.composition.steps as step, index (step.compositionStepId)}
						{@const label = durationLabel(step)}
						{@const timerId = String(step.compositionStepId)}
						{@const seconds =
							step.scaledDurationMin && step.durationUnit
								? parseDurationSeconds(step.scaledDurationMin, step.durationUnit)
								: null}
						{@const timer = timers.get(timerId)}
						<tr
							class:selected={selectedStep === step.compositionStepId}
							class:override={step.isOverride}
							onclick={() =>
								(selectedStep =
									selectedStep === step.compositionStepId ? null : step.compositionStepId)}
						>
							<td class="c-n">{index + 1}</td>
							<td class="c-time">
								{#if label}
									<span class="dur {step.durationKind}">{label}</span>
									{#if step.durationScalingFormula}<span class="fx">ƒ</span>{/if}
								{:else}
									<span class="nil">—</span>
								{/if}
							</td>
							<td class="c-instr">
								{step.renderedInstruction}
								{#if step.isOverride}<span class="tag ovr">override</span>{/if}
								{#if step.otherCompositionsReferencing.length > 0}
									<span class="tag shared"
										>shared with {step.otherCompositionsReferencing
											.map((c) => c.name ?? 'default')
											.join(', ')}</span
									>
								{/if}
							</td>
							<td class="c-ing">
								{#if step.usages.length === 0}
									<span class="nil">—</span>
								{:else}
									{#each step.usages as usage (usage.id)}
										<span
											class="chip"
											class:flag={(data.flaggedTagsByIngredientId[usage.ingredientId] ?? [])
												.length > 0}
										>
											<b>{usage.displayQuantity}</b>
											{usage.ingredient.baseTerm}{#if usage.scalingFormula}<i class="fx">ƒ</i>{/if}
										</span>
									{/each}
								{/if}
							</td>
							<td class="c-act">
								{#if seconds}
									{#if timer && !timers.isDone(timer)}
										<button
											type="button"
											class="run"
											onclick={(e) => {
												e.stopPropagation();
												timers.finish(timerId);
											}}>{formatRemaining(timers.remaining(timer))}</button
										>
									{:else if timer}
										<span class="done">done</span>
									{:else}
										<button
											type="button"
											onclick={(e) => {
												e.stopPropagation();
												timers.start(timerId, step.renderedInstruction.slice(0, 40), seconds);
											}}>start</button
										>
									{/if}
								{/if}
							</td>
						</tr>
						{#if selectedStep === step.compositionStepId}
							<tr class="detail">
								<td colspan="5">
									<dl>
										{#each step.usages as usage (usage.id)}
											<div>
												<dt>{usage.displayQuantity} {ingredientLabel(usage.ingredient)}</dt>
												<dd>
													{#if usage.prepAttribute}<span>{usage.prepAttribute}</span>{/if}
													{#if usage.alternativeIngredient}<span
															>alt: {ingredientLabel(usage.alternativeIngredient)}</span
														>{/if}
													{#if usage.scalingFormula}<span class="fx-detail"
															>{usage.scalingFormula.kind}
															{usage.scalingFormula.ratePercent ?? ''}</span
														>{/if}
													{#if usage.note}<span class="note">{usage.note}</span>{/if}
													{#each data.flaggedTagsByIngredientId[usage.ingredientId] ?? [] as tag (tag.id)}
														<span class="flagtag">{tag.name}</span>
													{/each}
												</dd>
											</div>
										{/each}
									</dl>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
			{#if data.diners.length > 0}
				<p class="diners">
					Diners: {data.diners.map((d) => d.name).join(', ')} — flagged ingredients highlighted
				</p>
			{/if}
		</div>

		<aside class="inspector">
			<div class="tabs">
				{#each PANES as key (key)}
					<button type="button" class:on={pane === key} onclick={() => (pane = key)}>{key}</button>
				{/each}
			</div>

			<div class="pane-body">
				{#if pane === 'ingredients'}
					<table class="mini">
						<tbody>
							{#each lines as line (line.key)}
								<tr
									class:flag={(data.flaggedTagsByIngredientId[line.ingredient.id] ?? []).length > 0}
								>
									<td class="q">{line.display}</td>
									<td>{ingredientLabel(line.ingredient)}</td>
									<td class="n">{line.usages.length > 1 ? `${line.usages.length}×` : ''}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else if pane === 'history'}
					<ul class="log">
						{#each data.cooks as cook (cook.id)}
							<li>
								<div class="log-head">
									<span class="dot {cook.outcome}"></span>
									<b>{cook.cookedAt}</b>
									<span>{data.profiles.find((p) => p.id === cook.actingProfileId)?.name}</span>
									<span class="pill">{OUTCOME_LABELS[cook.outcome]}</span>
								</div>
								{#if cook.summary}<p>{cook.summary}</p>{/if}
								{#each data.annotationsByCookId[cook.id] ?? [] as annotation (annotation.id)}
									<p class="ann">↳ {annotation.note}</p>
								{/each}
							</li>
						{/each}
					</ul>
				{:else if pane === 'versions'}
					<ul class="log">
						{#each data.versions as version (version.id)}
							<li>
								<div class="log-head">
									<b>v{version.number}</b>
									<span>{version.createdAt}</span>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<div class="meta">
						<h3>Categories</h3>
						<p>{data.recipeCategories.map((c) => c.name).join(', ') || '—'}</p>
						<h3>Collections</h3>
						<p>{data.recipeCollections.map((c) => c.name).join(', ') || '—'}</p>
						<h3>Favorited by</h3>
						<p>{data.favoritedBy.map((p) => p.name).join(', ') || '—'}</p>
					</div>
				{/if}
			</div>
		</aside>
	</div>
</div>

<style>
	.workbench {
		--bg: #14161a;
		--panel: #1b1e24;
		--line: #2b3038;
		--text: #d8dde5;
		--dim: #8992a0;
		--accent: #6fd08c;
		--warn: #e2725b;
		position: fixed;
		inset: 0;
		display: flex;
		flex-direction: column;
		background: var(--bg);
		color: var(--text);
		font-family: ui-sans-serif, system-ui, sans-serif;
		font-size: 13px;
		overflow: hidden;
	}

	.toolbar {
		border-bottom: 1px solid var(--line);
		background: var(--panel);
		padding: 0.5rem 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		flex: none;
	}
	.title {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}
	.crumb {
		color: var(--dim);
		font-size: 11px;
	}
	h1 {
		margin: 0;
		font-size: 15px;
		font-weight: 600;
	}
	.star {
		color: #e8c56a;
		font-size: 11px;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.seg {
		display: flex;
		border: 1px solid var(--line);
		border-radius: 4px;
		overflow: hidden;
	}
	.seg a {
		padding: 0.22rem 0.6rem;
		color: var(--dim);
		text-decoration: none;
		font-size: 12px;
		border-right: 1px solid var(--line);
	}
	.seg a:last-child {
		border-right: 0;
	}
	.seg a.on {
		background: var(--accent);
		color: #10231a;
		font-weight: 600;
	}
	.seg-label {
		padding: 0.22rem 0.5rem;
		color: var(--dim);
		font-size: 11px;
		border-right: 1px solid var(--line);
		background: #22262e;
	}
	.servings a {
		font-variant-numeric: tabular-nums;
		min-width: 1.9rem;
		text-align: center;
	}
	.baseline {
		font-size: 11px;
		color: var(--dim);
		font-variant-numeric: tabular-nums;
	}
	.baseline.changed {
		color: var(--accent);
	}
	.timer-badge {
		margin-left: auto;
		background: var(--warn);
		color: #1b0d09;
		border-radius: 3px;
		padding: 0.12rem 0.45rem;
		font-weight: 700;
		font-size: 11px;
	}

	.panes {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 22rem;
		min-height: 0;
	}
	.steps-pane {
		overflow: auto;
		border-right: 1px solid var(--line);
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}
	thead th {
		position: sticky;
		top: 0;
		background: var(--panel);
		text-align: left;
		font-size: 10px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--dim);
		font-weight: 500;
		padding: 0.35rem 0.6rem;
		border-bottom: 1px solid var(--line);
		z-index: 1;
	}
	tbody tr {
		border-bottom: 1px solid var(--line);
		cursor: pointer;
	}
	tbody tr:hover {
		background: #1f232a;
	}
	tbody tr.selected {
		background: #232a33;
	}
	tbody tr.override td.c-n {
		box-shadow: inset 2px 0 0 var(--accent);
	}
	td {
		padding: 0.4rem 0.6rem;
		vertical-align: top;
	}
	.c-n {
		width: 2rem;
		color: var(--dim);
		font-variant-numeric: tabular-nums;
	}
	.c-time {
		width: 8rem;
		white-space: nowrap;
	}
	.c-ing {
		width: 20rem;
	}
	.c-act {
		width: 5rem;
		text-align: right;
	}
	.dur {
		font-variant-numeric: tabular-nums;
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 11px;
		padding: 0.08rem 0.3rem;
		border-radius: 3px;
		background: #262b33;
	}
	.dur.wait {
		color: #9db4e0;
	}
	.dur.cook {
		color: #e0a96d;
	}
	.dur.active {
		color: var(--accent);
	}
	.fx {
		color: #c58ae0;
		font-style: normal;
		font-size: 10px;
	}
	.nil {
		color: #444a54;
	}
	.c-instr {
		line-height: 1.45;
	}
	.tag {
		display: inline-block;
		font-size: 10px;
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0 0.25rem;
		margin-left: 0.35rem;
		color: var(--dim);
	}
	.tag.ovr {
		border-color: var(--accent);
		color: var(--accent);
	}
	.chip {
		display: inline-block;
		font-size: 11px;
		background: #22272f;
		border-radius: 3px;
		padding: 0.08rem 0.35rem;
		margin: 0 0.2rem 0.2rem 0;
		color: var(--dim);
	}
	.chip b {
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}
	.chip.flag,
	tr.flag {
		outline: 1px solid var(--warn);
		color: var(--warn);
	}
	.c-act button {
		font: inherit;
		font-size: 11px;
		background: transparent;
		border: 1px solid var(--line);
		color: var(--dim);
		border-radius: 3px;
		padding: 0.15rem 0.45rem;
		cursor: pointer;
	}
	.c-act button:hover {
		border-color: var(--accent);
		color: var(--accent);
	}
	.c-act button.run {
		background: var(--warn);
		border-color: var(--warn);
		color: #1b0d09;
		font-variant-numeric: tabular-nums;
		font-weight: 700;
	}
	.done {
		color: var(--accent);
		font-size: 11px;
	}

	tr.detail {
		background: #10131a;
		cursor: default;
	}
	tr.detail dl {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr));
		gap: 0.5rem;
	}
	tr.detail dt {
		font-weight: 600;
		font-size: 12px;
	}
	tr.detail dd {
		margin: 0.15rem 0 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		font-size: 11px;
		color: var(--dim);
	}
	.fx-detail {
		color: #c58ae0;
	}
	.flagtag {
		color: var(--warn);
		border: 1px solid var(--warn);
		border-radius: 3px;
		padding: 0 0.25rem;
	}
	.note {
		font-style: italic;
	}
	.diners {
		margin: 0;
		padding: 0.5rem 0.6rem;
		color: var(--dim);
		font-size: 11px;
		border-top: 1px solid var(--line);
	}

	.inspector {
		display: flex;
		flex-direction: column;
		min-height: 0;
		background: var(--panel);
	}
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--line);
		flex: none;
	}
	.tabs button {
		flex: 1;
		font: inherit;
		font-size: 11px;
		background: transparent;
		border: 0;
		border-bottom: 2px solid transparent;
		color: var(--dim);
		padding: 0.5rem 0;
		cursor: pointer;
	}
	.tabs button.on {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	.pane-body {
		overflow: auto;
		padding: 0.5rem 0.7rem;
	}
	.mini td {
		padding: 0.22rem 0.3rem;
		font-size: 12px;
		border-bottom: 1px solid #22262e;
	}
	.mini .q {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
		color: var(--text);
		font-weight: 600;
	}
	.mini .n {
		color: var(--dim);
		font-size: 10px;
		text-align: right;
	}
	.log {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.log li {
		border-bottom: 1px solid var(--line);
		padding: 0.5rem 0;
	}
	.log-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 11px;
		color: var(--dim);
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--dim);
	}
	.dot.worked-well {
		background: var(--accent);
	}
	.dot.needs-tweaks {
		background: #e0a96d;
	}
	.pill {
		margin-left: auto;
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0 0.25rem;
		font-size: 10px;
	}
	.log p {
		margin: 0.25rem 0 0;
		font-size: 12px;
		line-height: 1.45;
	}
	.ann {
		color: var(--dim);
		padding-left: 0.5rem;
	}
	.meta h3 {
		margin: 0.8rem 0 0.2rem;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--dim);
		font-weight: 500;
	}
	.meta p {
		margin: 0;
		font-size: 12px;
	}
</style>
