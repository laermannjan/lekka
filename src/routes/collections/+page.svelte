<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1>Collections</h1>

{#if data.collections.length > 0}
	<ul>
		{#each data.collections as collection (collection.id)}
			<li>
				<a href={resolve('/collections/[id]', { id: String(collection.id) })}>{collection.name}</a>
			</li>
		{/each}
	</ul>
{:else}
	<p>No collections yet.</p>
{/if}

<h2>Create a collection</h2>

{#if form?.collectionError}
	<p role="alert">{form.collectionError}</p>
{/if}

<form method="POST" action="?/createCollection">
	<label>
		Name
		<input type="text" name="name" required maxlength="80" placeholder="e.g. weeknight dinners" />
	</label>
	<button type="submit">Create collection</button>
</form>
