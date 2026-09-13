// GO-01 step 6: the switch to canonical game authority.

// Off by default until the operator flips it post-backfill.
export function gameAccessAuthoritative(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GAME_ACCESS_AUTHORITATIVE?.trim() === 'true';
}
