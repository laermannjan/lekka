<!--
	PROTOTYPE — app-wide theme switcher. Sets `data-proto-theme` on <html> and
	remembers the choice in localStorage, so the theme survives clicking
	around the whole app rather than living in one page's URL. Deliberately
	ugly and high contrast so it never reads as part of the design being
	judged. Hidden outside dev. Delete along with prototype-theme.css.
-->
<script lang="ts">
	import { dev } from '$app/environment';

	const THEMES = [
		{ key: 'none', name: 'No CSS (today)' },
		{ key: 'a', name: 'Counter' },
		{ key: 'b', name: 'Workbench' },
		{ key: 'c', name: 'Cook' }
	];
	const STORAGE_KEY = 'proto-theme';

	let current = $state('a');

	$effect(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored && THEMES.some((t) => t.key === stored)) current = stored;
	});

	// `none` removes the attribute entirely, which drops every token back to
	// the bare `:root` defaults - the closest honest look at what shipping
	// without a base layer actually gives you.
	$effect(() => {
		const root = document.documentElement;
		if (current === 'none') root.removeAttribute('data-proto-theme');
		else root.setAttribute('data-proto-theme', current);
		localStorage.setItem(STORAGE_KEY, current);
	});

	function go(offset: number) {
		const index = THEMES.findIndex((t) => t.key === current);
		current = THEMES[(index + offset + THEMES.length) % THEMES.length].key;
	}

	function onKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.matches('input, textarea, select, [contenteditable]')) return;
		if (event.key === 'ArrowLeft') go(-1);
		if (event.key === 'ArrowRight') go(1);
	}

	const label = $derived(THEMES.find((t) => t.key === current)?.name ?? current);
</script>

<svelte:window onkeydown={onKey} />

{#if dev}
	<div class="proto-switcher">
		<button type="button" onclick={() => go(-1)} aria-label="Previous theme">←</button>
		<span>{label}</span>
		<button type="button" onclick={() => go(1)} aria-label="Next theme">→</button>
	</div>
{/if}

<style>
	.proto-switcher {
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
	.proto-switcher span {
		padding: 0 0.7rem;
		white-space: nowrap;
		min-width: 8rem;
		text-align: center;
	}
	.proto-switcher button {
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
	.proto-switcher button:hover {
		background: #555;
	}
</style>
