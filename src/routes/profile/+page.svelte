<script lang="ts">
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	// Sensory Tags are left out of the avoid-Tag picker - a dietary
	// preference is an allergen/diet decision, not a texture/flavor one (see
	// CONTEXT.md's Tag Group).
	const avoidTagOptions = $derived(data.tags.filter((tag) => tag.tagGroup !== 'sensory'));
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

{#if data.profile}
	<section>
		<h2>Your dietary preferences</h2>
		<p>
			Avoid-tags are standing - any ingredient usage carrying one is flagged (never hidden) when
			you're a selected diner.
		</p>
		<form method="POST" action="?/updateAvoidTags">
			<fieldset>
				<legend>Avoid tags</legend>
				{#if avoidTagOptions.length > 0}
					{#each avoidTagOptions as tag (tag.id)}
						<label>
							<input
								type="checkbox"
								name="tagIds"
								value={tag.id}
								checked={data.avoidTags.some((t) => t.id === tag.id)}
							/>
							{tag.name} <em>({tag.tagGroup})</em>
						</label>
					{/each}
				{:else}
					<p>No allergen/diet tags yet.</p>
				{/if}
			</fieldset>
			<button type="submit">Save preferences</button>
		</form>
	</section>
{/if}

<section>
	<h2>Diners</h2>
	<p>
		Who's eating? Defaults to you, but is independent of who's logged in and persists until changed.
	</p>
	{#if form?.error}
		<p role="alert">{form.error}</p>
	{/if}
	{#if data.profiles.length > 0}
		<form method="POST" action="?/updateDiners">
			<fieldset>
				<legend>Diners</legend>
				{#each data.profiles as profile (profile.id)}
					<label>
						<input
							type="checkbox"
							name="dinerIds"
							value={profile.id}
							checked={data.diners.some((d) => d.id === profile.id)}
						/>
						{profile.name}
					</label>
				{/each}
			</fieldset>
			<button type="submit">Save diners</button>
		</form>
	{/if}
</section>
