import type { FastifyRequest } from 'fastify';

// Promotional games, playable without a session. See PUBLIC_PLAY_SLUGS.

const GAME_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parsePublicPlaySlugs(value: string | undefined): string[] {
  return [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((slug) => slug.trim().toLowerCase())
        .filter((slug) => GAME_SLUG_PATTERN.test(slug)),
    ),
  ];
}

// Slug of a would-be anonymous play request, else null.
export function publicPlayRequestSlug(request: FastifyRequest): string | null {
  const path = request.url.split('?')[0] ?? request.url;

  if (request.method === 'POST' && path === '/api/telemetry') {
    const body = request.body;
    return typeof body === 'object' &&
      body !== null &&
      'slug' in body &&
      typeof (body as { slug?: unknown }).slug === 'string'
      ? (body as { slug: string }).slug
      : null;
  }

  if (request.method !== 'GET') return null;
  const match = path.match(/^\/api\/games\/([^/]+)(?:\/(votes|world|presence))?\/?$/);
  if (!match?.[1]) return null;

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
