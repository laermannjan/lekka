<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<header>
	<a href={resolve('/')}>lekka</a>
	{#if data.profile}
		<nav>
			<a href={resolve('/')}>Recipes</a>
			<a href={resolve('/ingredients')}>Ingredients</a>
			<a href={resolve('/collections')}>Collections</a>
			<span>{data.profile.name} · <a href={resolve('/profile')}>Switch</a></span>
		</nav>
	{/if}
</header>

<main>
	{@render children()}
</main>
