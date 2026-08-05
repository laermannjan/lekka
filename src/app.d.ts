// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { Profile } from '$lib/server/db/schema';

declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			profile: Profile | undefined;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
