// The fallback is public: fine for local runs, forgeable in production.
export const DEV_SESSION_SECRET = 'dev-session-secret-change-me';

// A forgeable session is an account takeover; refuse rather than fall back.
export function resolveSessionSecret(configured?: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = configured ?? env.SESSION_SECRET;
  if (!secret && env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required to sign sessions in production');
  }
  return secret ?? DEV_SESSION_SECRET;
}
