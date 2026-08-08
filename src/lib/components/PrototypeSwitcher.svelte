<!--
	PROTOTYPE — floating variant switcher. Deliberately ugly and high contrast
	so it never reads as part of the design being judged. Hidden outside dev.
	Delete along with the variants.
-->
<script lang="ts">
	import { dev } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	let { variants, names }: { variants: string[]; names: Record<string, string> } = $props();

	const current = $derived(page.url.searchParams.get('variant') ?? variants[0]);

	function go(offset: number) {
		const index = variants.indexOf(current);
		const next = variants[(index + offset + variants.length) % variants.length];
		const url = new URL(page.url);
		url.searchParams.set('variant', next);
		goto(url, { replaceState: true, noScroll: true, keepFocus: true });
	}

	function onKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.matches('input, textarea, select, [contenteditable]')) return;
		if (event.key === 'ArrowLeft') go(-1);
		if (event.key === 'ArrowRight') go(1);
	}
</script>

<svelte:window onkeydown={onKey} />

{#if dev}
	<div class="switcher">
		<button type="button" onclick={() => go(-1)} aria-label="Previous variant">←</button>
		<span>{current} — {names[current] ?? ''}</span>
		<button type="button" onclick={() => go(1)} aria-label="Next variant">→</button>
	</div>
{/if}

<style>
	.switcher {
		position: fixed;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: #111;
		color: #fff;
		border: 2px solid #fff;
		border-radius: 999px;
		padding: 0.3rem 0.4rem;
		box-shadow: 0 6px 24px rgb(0 0 0 / 0.35);
		font:
			600 13px/1 ui-monospace,
			SFMono-Regular,
			monospace;
	}
	.switcher span {
		padding: 0 0.6rem;
		white-space: nowrap;
	}
	.switcher button {
		font: inherit;
		font-size: 15px;
		background: #333;
		color: #fff;
		border: 0;
		border-radius: 999px;
		width: 1.9rem;
		height: 1.9rem;
		cursor: pointer;
	}
	.switcher button:hover {
		background: #555;
	}
</style>
