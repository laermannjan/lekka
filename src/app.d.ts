// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Profile } from '$lib/server/db/schema';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			profile: Profile | undefined;
			// The set of Profiles currently selected as present/eating (see
			// CONTEXT.md's Diners) - defaults to just the acting Profile until
			// explicitly changed, resolved once per request in hooks.server.ts.
			dinerProfiles: Profile[];
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
