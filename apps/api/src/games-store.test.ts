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
  // The behavioural golden is part of a minimal delivery, not an extra: without it the
  // gate stops at the trace stage and the version can never reach a verdict.
  { path: 'TRACE.json', content: '{"samples":[]}' },
  // Same status as the golden above, for the same reason: the harness's Check 26 refuses
  // a game that does not declare its progress landmarks, so a delivery without this one
  // reaches validate and stops there having produced nothing.
  { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
];

describe('validateSourceUpload — the delivery contract', () => {
  it('accepts a minimal game', () => {
    expect(validateSourceUpload(MINIMAL)).toHaveLength(MINIMAL.length);
  });

  it('accepts the game’s own modules', () => {
    expect(validateSourceUpload([...MINIMAL, { path: 'entities/player.ts', content: 'export {};' }])).toHaveLength(
      MINIMAL.length + 1,
    );
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

  it('accepts and requires the behavioural golden the gate checks against', () => {
    // Both halves, because they failed apart. The games repo's submit tool sends
    // TRACE.json; this list did not include it, so the server answered 400 and named
    // every file that *was* deliverable — and a real agent read that message, dropped
    // the golden, and delivered a version the gate could only fail. A delivery contract
    // that disagrees with the tool implementing it teaches the agent to route around it.
    expect(validateSourceUpload(MINIMAL).map((f) => f.path)).toContain('TRACE.json');
    expect(() => validateSourceUpload(MINIMAL.filter((f) => f.path !== 'TRACE.json'))).toThrow(
      /TRACE\.json is required/,
    );
  });

  it('accepts and requires the playtest contract the harness checks against', () => {
    // The same failure as the golden above, made a second time. Check 26 landed in the
    // games repo requiring PLAYTEST.json; this list was not updated, so no agent could
    // deliver one — and every game built afterwards passed capture, stopped at validate,
    // and produced no bundle. The creator saw a finished build with nothing to play.
    expect(validateSourceUpload(MINIMAL).map((f) => f.path)).toContain('PLAYTEST.json');
    expect(() => validateSourceUpload(MINIMAL.filter((f) => f.path !== 'PLAYTEST.json'))).toThrow(
      /PLAYTEST\.json is required/,
    );
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
    expect(first).toMatch(/^v20260730T100000000Z-[0-9a-f]{6}$/);
    expect([second, first].sort()).toEqual([first, second]);
  });

  it('does not collide for two deliveries at the same instant', () => {
    // Versions are immutable, so a colliding id is not a cosmetic problem: the second
    // delivery would overwrite the first's sources in place and the surviving manifest
    // would describe a mixture of the two.
    const at = new Date('2026-07-30T10:00:00.000Z');
    const ids = new Set(Array.from({ length: 200 }, () => defaultVersionId(at)));
    expect(ids.size).toBe(200);
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

    // The exact id is defaultVersionId's business, tested above; what matters here is
    // that everything for this delivery lands under whatever id it chose.
    expect(version).toMatch(/^v20260730T100000000Z-/);
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

  it('pins the engine the first gate run checked against, and never repins', async () => {
    const { impl } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    const { version } = await store.putCandidateSources({ slug: 'g', issueNumber: 1, files: MINIMAL });

    await store.putGateResult('g', version, { green: true, engineRef: 'aaa111' });
    // A later re-run against a moved engine must not rewrite what the verdict was
    // rendered against — the pin is provenance, and provenance is append-only.
    await store.putGateResult('g', version, { green: true, engineRef: 'bbb222' });

    expect((await store.getManifest('g', version))?.engineRef).toBe('aaa111');
  });

  it('records a health verdict beside the gate verdict, never over it', async () => {
    const { impl } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    const { version } = await store.putCandidateSources({ slug: 'g', issueNumber: 1, files: MINIMAL });
    await store.putGateResult('g', version, { green: true, report: 'accepted' });

    // The engine moved on and the same game now fails. The acceptance verdict is the
    // record of why this version was allowed to publish; a red health run erasing it
    // would erase the justification along with it.
    await store.putHealthResult('g', version, { green: false, report: 'trace diverged', engineRef: 'ccc333' });

    const manifest = await store.getManifest('g', version);
    expect(manifest?.gate).toMatchObject({ green: true, report: 'accepted' });
    expect(manifest?.health).toMatchObject({ green: false, report: 'trace diverged', engineRef: 'ccc333' });
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
