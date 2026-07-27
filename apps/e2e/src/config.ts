/**
 * Constants shared between globalSetup and the test workers.
 *
 * Deliberately its own module with **no `vitest` import**. `globalSetup` runs in a
 * different context from the workers, and importing `vitest` there fails outright
 * ("Vitest failed to access its internal state"). `browser.ts` imports `inject`, so
 * anything globalSetup needs has to live somewhere that does not drag that in.
 */

export const BASE_URL = process.env.E2E_BASE_URL ?? 'https://www.gamedev.pl';

/** Key under which globalSetup publishes the once-per-run session state path. */
export const STORAGE_STATE_ENV = 'E2E_STORAGE_STATE';
