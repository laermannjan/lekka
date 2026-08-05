<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<h1>Who's cooking?</h1>

{#if form?.error}
	<p role="alert">{form.error}</p>
{/if}

{#if data.profiles.length > 0}
	<ul>
		{#each data.profiles as profile (profile.id)}
			<li>
				<form method="POST" action="?/select">
					<input type="hidden" name="profileId" value={profile.id} />
					<button type="submit">{profile.name}</button>
				</form>
			</li>
		{/each}
	</ul>
{:else}
	<p>No household members yet — add the first one below.</p>
{/if}

<form method="POST" action="?/create">
	<label>
		Name
		<input type="text" name="name" required maxlength="60" />
	</label>
	<button type="submit">Add profile</button>
</form>
