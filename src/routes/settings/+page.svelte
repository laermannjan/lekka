<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<h1>Settings</h1>

<section>
	<h2>Export</h2>
	<p>
		Download every Recipe, Ingredient, Tag, Profile, Cook Log entry, and everything else in this
		household's data as a single JSON file.
	</p>
	<a href={resolve('/settings/export')} download>Download export</a>
</section>

<section>
	<h2>Restore</h2>
	<p>
		Restoring from a previous export <strong>replaces everything currently in this instance</strong> -
		it does not merge with what's already here. There's no undo short of restoring a different file.
	</p>

	{#if form?.error}
		<p role="alert">{form.error}</p>
	{/if}
	{#if form?.restored}
		<p>Restore complete.</p>
	{/if}

	<form method="POST" action="?/restore" enctype="multipart/form-data">
		<label>
			Export file
			<input type="file" name="file" accept="application/json" required />
		</label>
		<button type="submit">Restore</button>
	</form>
</section>
