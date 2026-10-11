// Local dev: signed links must point at this server, not production.
export const LOCAL_DEV_ORIGIN = 'http://localhost:5173';

export function applyLocalDevOrigin(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' || env.CANONICAL_HOST?.trim() || env.APP_BASE_URL?.trim()) return;
  env.APP_BASE_URL = LOCAL_DEV_ORIGIN;
}
