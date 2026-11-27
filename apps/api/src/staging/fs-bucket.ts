// A directory standing in for the games bucket, for the builder staging loop.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GcsObjectStore } from '../delivery/gcs-sign.js';

export interface FsBucket {
  root: string;
  // Speaks the slice of the GCS JSON API that games-store and gcs-sign use.
  fetch: typeof fetch;
  objectStore: GcsObjectStore;
  // Checks a URL minted by objectStore.signReadUrl and returns its object name.
  verifyReadUrl(name: string, signature: string, expires: string): boolean;
}

const API = 'https://storage.googleapis.com/storage/v1/b/';
const UPLOAD = 'https://storage.googleapis.com/upload/storage/v1/b/';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function walk(dir: string, base = ''): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const names: string[] = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) names.push(...(await walk(path.join(dir, entry.name), rel)));
    else if (entry.isFile()) names.push(rel);
  }
  return names;
}

export function createFsBucket(options: { root: string; publicBaseUrl: () => string; secret: string }): FsBucket {
  const { root, secret } = options;
  // Generations live in memory: one process owns the directory for a run.
  const generations = new Map<string, number>();
  let clock = 0;

  const fileFor = (name: string) => {
    const resolved = path.resolve(root, name);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error(`object name escapes bucket: ${name}`);
    return resolved;
  };
  const generationOf = async (name: string): Promise<number> => {
    const known = generations.get(name);
    if (known !== undefined) return known;
    const exists = await stat(fileFor(name)).then(
      (s) => s.isFile(),
      () => false,
    );
    if (!exists) return 0;
    generations.set(name, 1);
    return 1;
  };

  async function handle(href: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? 'GET').toUpperCase();
    const url = new URL(href);
    if (href.startsWith(UPLOAD) && method === 'POST') {
      const name = url.searchParams.get('name') ?? '';
      const match = url.searchParams.get('ifGenerationMatch');
      const current = await generationOf(name);
      if (match !== null && Number(match) !== current) return json({ error: 'precondition' }, 412);
      const file = fileFor(name);
      await mkdir(path.dirname(file), { recursive: true });
      const body = init.body;
      const bytes = typeof body === 'string' ? Buffer.from(body) : Buffer.from(body as Uint8Array);
      await writeFile(file, bytes);
      const next = Math.max(current, clock) + 1;
      clock = next;
      generations.set(name, next);
      return json({ name, generation: String(next), size: String(bytes.length) });
    }
    if (!href.startsWith(API)) return json({ error: `fs bucket does not serve ${href}` }, 501);
    const rest = href.slice(API.length).split('?')[0];
    const slash = rest.indexOf('/o');
    const tail = rest.slice(slash + 2);
    if (tail === '' || tail === '/') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const delimiter = url.searchParams.get('delimiter');
      const all = (await walk(root)).filter((name) => name.startsWith(prefix)).sort();
      const items: Array<{ name: string; size: string; generation: string }> = [];
      const prefixes = new Set<string>();
      for (const name of all) {
        const after = name.slice(prefix.length);
        const cut = delimiter ? after.indexOf(delimiter) : -1;
        if (cut >= 0) prefixes.add(prefix + after.slice(0, cut + delimiter!.length));
        else {
          const size = (await stat(fileFor(name))).size;
          items.push({ name, size: String(size), generation: String(await generationOf(name)) });
        }
      }
      return json({ items, prefixes: [...prefixes] });
    }
    const name = decodeURIComponent(tail.slice(1));
    const file = fileFor(name);
    if (method === 'DELETE') {
      generations.delete(name);
      await rm(file, { force: true });
      return new Response(null, { status: 204 });
    }
    const body = await readFile(file).catch(() => null);
    if (!body) return json({ error: 'not found' }, 404);
    const generation = String(await generationOf(name));
    if (url.searchParams.get('alt') === 'media') {
      return new Response(new Uint8Array(body), { status: 200, headers: { 'x-goog-generation': generation } });
    }
    return json({ name, size: String(body.length), generation });
  }

  const sign = (name: string, expires: string) =>
    createHmac('sha256', secret).update(`${name}\n${expires}`).digest('hex');
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) =>
    handle(String(input instanceof Request ? input.url : input), init)) as typeof fetch;

  const objectStore: GcsObjectStore = {
    async readObject(name) {
      return readFile(fileFor(name)).catch(() => null);
    },
    async objectExists(name) {
      return (await generationOf(name)) > 0;
    },
    // The sandbox reaches these through the run's public tunnel.
    async signReadUrl(name, expiresSeconds = 3600, signedAtMs) {
      const expires = String(Math.floor((signedAtMs ?? Date.now()) / 1000) + expiresSeconds);
      const query = new URLSearchParams({ expires, sig: sign(name, expires) });
      return `${options.publicBaseUrl()}/staging-bucket/${name.split('/').map(encodeURIComponent).join('/')}?${query}`;
    },
  };

  return {
    root,
    fetch: fetchImpl,
    objectStore,
    verifyReadUrl(name, signature, expires) {
      if (!/^\d+$/.test(expires) || Number(expires) * 1000 < Date.now()) return false;
      const expected = Buffer.from(sign(name, expires));
      const given = Buffer.from(signature);
      return expected.length === given.length && timingSafeEqual(expected, given);
    },
  };
}
