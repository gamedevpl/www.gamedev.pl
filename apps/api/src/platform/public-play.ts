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

export function isPublicPlayRequest(request: FastifyRequest, publicPlaySlugs: Set<string>): boolean {
  const path = request.url.split('?')[0] ?? request.url;

  if (request.method === 'POST' && path === '/api/telemetry') {
    const body = request.body;
    return (
      typeof body === 'object' &&
      body !== null &&
      'slug' in body &&
      typeof (body as { slug?: unknown }).slug === 'string' &&
      publicPlaySlugs.has((body as { slug: string }).slug)
    );
  }

  if (request.method !== 'GET') return false;
  const match = path.match(/^\/api\/games\/([^/]+)(?:\/(votes|world|presence))?\/?$/);
  if (!match?.[1]) return false;

  let slug: string;
  try {
    slug = decodeURIComponent(match[1]);
  } catch {
    return false;
  }

  return publicPlaySlugs.has(slug);
}
