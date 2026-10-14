import type { VersionManifest } from './games-store.js';

export async function listStoredVersions(input: {
  slug: string;
  bucket: string;
  fetchImpl: typeof fetch;
  getAccessToken: () => Promise<string>;
  readObject: (path: string) => Promise<Buffer | null>;
  parse: (body: Buffer) => VersionManifest;
  limit?: number;
  before?: string;
}): Promise<VersionManifest[]> {
  const limit = Math.max(1, Math.min(input.limit ?? 30, 101));
  const prefix = `games/${input.slug}/versions/`;
  const versions: string[] = [];
  const seen = new Set<string>();
  let token: string | undefined;
  do {
    const query = new URLSearchParams({ prefix, delimiter: '/', fields: 'prefixes,nextPageToken' });
    if (token) query.set('pageToken', token);
    const response = await input.fetchImpl(
      `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(input.bucket)}/o?${query}`,
      { headers: { authorization: `Bearer ${await input.getAccessToken()}` } },
    );
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`games store list of ${prefix} failed: ${response.status}`);
    const listing = (await response.json()) as { prefixes?: string[]; nextPageToken?: string };
    for (const path of listing.prefixes ?? []) {
      const version = path.slice(prefix.length).replace(/\/$/, '');
      if (version && (!input.before || version.localeCompare(input.before) < 0)) versions.push(version);
    }
    token = listing.nextPageToken;
    if (token && seen.has(token)) throw new Error('games store repeated a history page token');
    if (token) seen.add(token);
  } while (token);
  versions.sort((a, b) => b.localeCompare(a));
  const collected: VersionManifest[] = [];
  for (let offset = 0; offset < versions.length && collected.length < limit; offset += limit) {
    const batch = await Promise.all(
      versions.slice(offset, offset + limit).map(async (version) => {
        const body = await input.readObject(`${prefix}${version}/manifest.json`);
        return body ? input.parse(body) : null;
      }),
    );
    for (const manifest of batch) if (manifest) collected.push(manifest);
  }
  return collected.slice(0, limit);
}
