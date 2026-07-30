import { describe, expect, it, vi } from 'vitest';
import {
  createGcsGamesStore,
  defaultVersionId,
  InvalidUploadError,
  MAX_UPLOAD_BYTES,
  validateSourceUpload,
  type SourceFile,
} from './games-store.js';

const MINIMAL: SourceFile[] = [
  { path: 'SPEC.md', content: '---\ntitle: A game\n---\n' },
  { path: 'index.html', content: '<!doctype html>' },
  { path: 'game.ts', content: 'export {};' },
];

describe('validateSourceUpload — the delivery contract', () => {
  it('accepts a minimal game', () => {
    expect(validateSourceUpload(MINIMAL)).toHaveLength(3);
  });

  it('accepts the game’s own modules', () => {
    expect(validateSourceUpload([...MINIMAL, { path: 'entities/player.ts', content: 'export {};' }])).toHaveLength(4);
  });

  it('refuses harness-shaped paths so a diff visibly respects the boundary', () => {
    // Confinement itself is structural — every stored path is prefixed with the
    // version's own source/, so none of these could ever have reached GameKit. They are
    // rejected so that a game directory never *looks* like it is editing the harness.
    for (const path of ['shared/modules/core.ts', 'tools/build.ts', 'catalog.json', '.github/workflows/validate.yml']) {
      expect(() => validateSourceUpload([...MINIMAL, { path, content: 'x' }])).toThrow(InvalidUploadError);
    }
  });

  it('refuses to let an agent reach another game', () => {
    expect(() => validateSourceUpload([...MINIMAL, { path: '../other-game/game.ts', content: 'x' }])).toThrow(
      /illegal path/,
    );
  });

  it('rejects traversal and absolute paths by shape', () => {
    for (const path of ['../x.ts', '/etc/passwd', 'a/../../b.ts', 'a\\b.ts', 'a\0b.ts']) {
      expect(() => validateSourceUpload([...MINIMAL, { path, content: 'x' }])).toThrow(/illegal path/);
    }
  });

  it('rejects duplicate paths rather than letting the last write win', () => {
    expect(() => validateSourceUpload([...MINIMAL, { path: 'game.ts', content: 'other' }])).toThrow(/duplicate/);
  });

  it('requires the files that make a delivery a game', () => {
    expect(() => validateSourceUpload([{ path: 'SPEC.md', content: 'x' }])).toThrow(/must be playable/);
    expect(() =>
      validateSourceUpload([
        { path: 'index.html', content: 'x' },
        { path: 'game.ts', content: 'x' },
      ]),
    ).toThrow(/SPEC.md is required/);
  });

  it('caps total upload size', () => {
    expect(() =>
      validateSourceUpload([...MINIMAL, { path: 'big.ts', content: 'x'.repeat(MAX_UPLOAD_BYTES + 1) }]),
    ).toThrow(/too large/);
  });

  it('explains itself, because the agent is the only one who can fix it', () => {
    // A vague rejection costs a whole session; the message names what is deliverable.
    expect(() => validateSourceUpload([...MINIMAL, { path: 'shared/x.ts', content: 'x' }])).toThrow(
      /belongs to the harness/,
    );
    expect(() => validateSourceUpload([...MINIMAL, { path: 'notes.txt', content: 'x' }])).toThrow(
      /Deliver only your own game's files/,
    );
  });
});

describe('defaultVersionId', () => {
  it('sorts chronologically and needs no coordination', () => {
    // A counter would be a race between concurrent builds of the same game; a timestamp
    // sorts identically with no shared state to contend for.
    const first = defaultVersionId(new Date('2026-07-30T10:00:00.000Z'));
    const second = defaultVersionId(new Date('2026-07-30T10:00:01.000Z'));
    expect(first).toBe('v20260730T100000Z');
    expect([second, first].sort()).toEqual([first, second]);
  });
});

function stubGcs() {
  const objects = new Map<string, Buffer>();
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    if (init.method === 'POST') {
      const name = decodeURIComponent(new URL(href).searchParams.get('name') ?? '');
      objects.set(name, Buffer.from(init.body as Uint8Array));
      return new Response('{}', { status: 200 });
    }
    const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
    const body = objects.get(name);
    return body ? new Response(new Uint8Array(body), { status: 200 }) : new Response('', { status: 404 });
  }) as unknown as typeof fetch;
  return { impl, objects };
}

describe('GCS games store', () => {
  const base = {
    bucket: 'b',
    getAccessToken: async () => 'token',
    now: () => Date.parse('2026-07-30T10:00:00Z'),
  };

  it('stores sources under an immutable version and records provenance', async () => {
    const { impl, objects } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });

    const { version, manifest } = await store.putCandidateSources({
      slug: 'comet-courier',
      issueNumber: 42,
      files: MINIMAL,
      backend: 'copilot',
      model: 'claude-sonnet-4.6',
      engineRef: 'abc123',
    });

    expect(version).toBe('v20260730T100000Z');
    expect(objects.has(`games/comet-courier/versions/${version}/source/game.ts`)).toBe(true);
    // Provenance is the point: which job, which backend, which model, which engine.
    expect(manifest).toMatchObject({
      issueNumber: 42,
      backend: 'copilot',
      model: 'claude-sonnet-4.6',
      engineRef: 'abc123',
    });
  });

  it('writes the manifest last, so a dead run leaves no version claiming missing files', async () => {
    const writes: string[] = [];
    const impl = (async (url: string | URL, init: RequestInit = {}) => {
      if (init.method === 'POST') writes.push(decodeURIComponent(new URL(String(url)).searchParams.get('name') ?? ''));
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    await store.putCandidateSources({ slug: 'g', issueNumber: 1, files: MINIMAL });

    expect(writes.at(-1)).toMatch(/manifest\.json$/);
  });

  it('rejects a bad slug before writing anything', async () => {
    const { impl, objects } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });

    await expect(store.putCandidateSources({ slug: '../evil', issueNumber: 1, files: MINIMAL })).rejects.toThrow(
      InvalidUploadError,
    );
    expect(objects.size).toBe(0);
  });

  it('records a gate verdict onto the version it judged', async () => {
    const { impl } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    const { version } = await store.putCandidateSources({ slug: 'g', issueNumber: 1, files: MINIMAL });

    await store.putGateResult('g', version, { green: false, report: '3 checks failed' });

    expect((await store.getManifest('g', version))?.gate).toMatchObject({ green: false, report: '3 checks failed' });
  });

  it('round-trips derived artifacts the gate produces', async () => {
    const { impl } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    const { version } = await store.putCandidateSources({ slug: 'g', issueNumber: 1, files: MINIMAL });

    await store.putDerivedArtifact('g', version, 'bundle.html', Buffer.from('<!doctype html>'), 'text/html');

    expect((await store.getDerivedArtifact('g', version, 'bundle.html'))?.toString()).toBe('<!doctype html>');
    expect(await store.getDerivedArtifact('g', version, 'missing.html')).toBeNull();
  });

  it('answers null for a version that does not exist', async () => {
    const { impl } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    expect(await store.getManifest('g', 'v1')).toBeNull();
    expect(await store.getSourceFile('g', 'v1', 'game.ts')).toBeNull();
  });

  it('marks version objects immutable so a CDN can front them later', async () => {
    const headers: Array<Record<string, string>> = [];
    const impl = (async (_url: string | URL, init: RequestInit = {}) => {
      if (init.method === 'POST') headers.push(init.headers as Record<string, string>);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    await store.putCandidateSources({ slug: 'g', issueNumber: 1, files: MINIMAL });

    expect(headers[0]['cache-control']).toContain('immutable');
  });

  it('uses the ambient service account when no token getter is injected', () => {
    // Ambient IAM, same as Firestore and Vertex: no API key exists to leak.
    expect(() => createGcsGamesStore({ bucket: 'b', fetchImpl: vi.fn() as unknown as typeof fetch })).not.toThrow();
  });
});
