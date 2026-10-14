import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';

export function previewHostConfig(hosts: Set<string>): string {
  return createHash('sha256')
    .update(JSON.stringify([...hosts].sort()))
    .digest('hex');
}

export function previewAllowedHosts(origin: string, env: NodeJS.ProcessEnv): Set<string> {
  const port = new URL(origin).port;
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
  const codespace = env.CODESPACE_NAME;
  const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? 'app.github.dev';
  const extra = (env.GAMEDEVPL_PREVIEW_ALLOWED_HOSTS ?? '').split(',');
  if (codespace) extra.push(`${codespace}-${port}.${domain}`);
  for (const value of extra) {
    const host = value.trim().toLowerCase();
    try {
      const parsed = new URL(`http://${host}`);
      if (
        host &&
        parsed.host === host &&
        parsed.pathname === '/' &&
        !parsed.username &&
        !parsed.password &&
        !parsed.search &&
        !parsed.hash
      )
        hosts.add(host);
    } catch {
      continue;
    }
  }
  return hosts;
}

export function trustedPreviewRequest(
  request: Pick<IncomingMessage, 'headers'>,
  allowedHosts: Set<string>,
  requireOrigin = false,
): boolean {
  const host = request.headers.host?.toLowerCase();
  if (!host || !allowedHosts.has(host)) return false;
  const origin = request.headers.origin;
  if (!origin) return !requireOrigin;
  try {
    const parsed = new URL(origin);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.origin === origin &&
      parsed.host.toLowerCase() === host
    );
  } catch {
    return false;
  }
}
