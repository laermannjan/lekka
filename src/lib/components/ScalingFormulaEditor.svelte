<script lang="ts">
	import { computeScaledDuration, computeScaledQuantity, linearScale } from '$lib/scaling';

	// Guided sentence templates for a Scaling Formula (see CONTEXT.md) -
	// never a free-form expression language, so every blank below is a
	// constrained field (a select, or a plain number), not raw syntax.
	// Reused for both an Ingredient Usage's Quantity (`allowVsOtherUsage`
	// false) and a Step's Duration (`allowVsOtherUsage` true - the only
	// target the "vs. another Usage" template applies to).

	type OtherUsageOption = { id: number; label: string; baseQuantity: number };

	type CurrentFormula = {
		kind: 'rate_vs_servings' | 'vs_other_usage' | 'fixed';
		ratePercent: number | null;
		otherUsageId: number | null;
		perUnitAmount: number | null;
		direction: 'increase' | 'decrease' | null;
		thresholdSide: 'short' | 'over' | null;
	};

	let {
		action,
		idFieldName,
		idFieldValue,
		allowVsOtherUsage,
		otherUsageOptions = [],
		currentFormula,
		baseValue,
		baseServings,
		unit,
		noneLabel
	}: {
		action: string;
		idFieldName: string;
		idFieldValue: number;
		allowVsOtherUsage: boolean;
		otherUsageOptions?: OtherUsageOption[];
		currentFormula: CurrentFormula | null;
		baseValue: number;
		baseServings: number;
		unit: string;
		noneLabel: string;
	} = $props();

	let scalingKind = $state(currentFormula?.kind ?? 'none');
	let ratePercent = $state(currentFormula?.ratePercent ?? 50);
	let otherUsageId = $state(currentFormula?.otherUsageId ?? otherUsageOptions[0]?.id ?? 0);
	let perUnitAmount = $state(currentFormula?.perUnitAmount ?? 1);
	let direction = $state<'increase' | 'decrease'>(currentFormula?.direction ?? 'increase');
	let thresholdSide = $state<'short' | 'over'>(currentFormula?.thresholdSide ?? 'short');
	let previewServings = $state(Math.max(1, baseServings * 2));

	function fmt(value: number): string {
		const rounded = Math.round(value * 100) / 100;
		return unit ? `${rounded} ${unit}` : `${rounded}`;
	}

	const previewValue = $derived.by(() => {
		if (scalingKind === 'none' || scalingKind === 'fixed') {
			return allowVsOtherUsage
				? baseValue // Duration default: constant, and 'fixed' is explicitly constant too
				: computeScaledQuantity(baseValue, baseServings, previewServings, null);
		}
		if (scalingKind === 'rate_vs_servings') {
			return allowVsOtherUsage
				? computeScaledDuration(baseValue, baseServings, previewServings, {
						kind: 'rate_vs_servings',
						ratePercent
					})
				: computeScaledQuantity(baseValue, baseServings, previewServings, {
						kind: 'rate_vs_servings',
						ratePercent
					});
		}
		// vs_other_usage - Duration only.
		const other = otherUsageOptions.find((o) => o.id === otherUsageId);
		if (!other) return baseValue;
		// The referenced Usage's own Quantity is assumed to scale linearly for
		// this preview - if it carries its own Scaling Formula, the live
		// recipe view (not this preview) reflects that formula's actual result.
		const otherScaledQuantity = linearScale(other.baseQuantity, baseServings, previewServings);
		return computeScaledDuration(
			baseValue,
			baseServings,
			previewServings,
			{ kind: 'vs_other_usage', otherUsageId, perUnitAmount, direction, thresholdSide },
			{ baseQuantity: other.baseQuantity, scaledQuantity: otherScaledQuantity }
		);
	});
</script>

<details open={currentFormula !== null}>
	<summary>{currentFormula ? 'Edit scaling rule' : 'Add a scaling rule'}</summary>
	<form method="POST" {action}>
		<input type="hidden" name={idFieldName} value={idFieldValue} />

		<fieldset>
			<legend>When servings change, this should…</legend>
			<label>
				<input type="radio" name="scalingKind" value="none" bind:group={scalingKind} />
				{noneLabel}
			</label>
			<label>
				<input type="radio" name="scalingKind" value="rate_vs_servings" bind:group={scalingKind} />
				increase/decrease at a rate relative to servings
			</label>
			{#if allowVsOtherUsage}
				<label>
					<input
						type="radio"
						name="scalingKind"
						value="vs_other_usage"
						bind:group={scalingKind}
						disabled={otherUsageOptions.length === 0}
					/>
					change based on another ingredient usage in this step
				</label>
			{/if}
			<label>
				<input type="radio" name="scalingKind" value="fixed" bind:group={scalingKind} />
				stay fixed, never scale
			</label>
		</fieldset>

		{#if scalingKind === 'rate_vs_servings'}
			<p>
				Should increase
				<strong
					>{ratePercent < 100
						? 'slower than'
						: ratePercent > 100
							? 'faster than'
							: 'exactly with'}</strong
				>
				servings, at
				<input
					type="number"
					name="ratePercent"
					bind:value={ratePercent}
					min="0"
					max="500"
					step="1"
					required
				/>% rate. (100% = exactly with servings, below = slower, above = faster)
			</p>
		{/if}

		{#if scalingKind === 'vs_other_usage'}
			<p>
				When
				<select name="otherUsageId" bind:value={otherUsageId} required>
					{#each otherUsageOptions as option (option.id)}
						<option value={option.id}>{option.label}</option>
					{/each}
				</select>
				's quantity is
				<select name="thresholdSide" bind:value={thresholdSide}>
					<option value="short">short of</option>
					<option value="over">over</option>
				</select>
				its usual amount, this duration should
				<select name="direction" bind:value={direction}>
					<option value="increase">increase</option>
					<option value="decrease">decrease</option>
				</select>
				by
				<input
					type="number"
					name="perUnitAmount"
					bind:value={perUnitAmount}
					min="0"
					step="any"
					required
				/>
				{unit} per unit.
			</p>
		{/if}

		{#if scalingKind !== 'none'}
			<p>
				Preview at
				<input type="number" bind:value={previewServings} min="1" step="1" /> servings:
				<strong>{fmt(previewValue)}</strong>
				(usually {fmt(baseValue)} at {baseServings} servings)
			</p>
		{/if}

		<button type="submit">Save scaling rule</button>
	</form>
</details>
