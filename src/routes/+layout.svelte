<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<!-- Required for Web Push at all on iOS - Notification/Push stay
	     undefined until the app is added to the Home Screen with a manifest
	     (see docs/research/pwa-timer-notifications.md). -->
	<link rel="manifest" href="/manifest.json" />
	<link rel="apple-touch-icon" href="/icon.svg" />
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="theme-color" content="#ff3e00" />
</svelte:head>

<header>
	<a href={resolve('/')}>lekka</a>
	{#if data.profile}
		<nav>
			<a href={resolve('/')}>Recipes</a>
			<a href={resolve('/ingredients')}>Ingredients</a>
			<a href={resolve('/collections')}>Collections</a>
			<a href={resolve('/settings')}>Settings</a>
			<span>{data.profile.name} · <a href={resolve('/profile')}>Switch</a></span>
		</nav>
	{/if}
</header>

<main>
	{@render children()}
</main>
