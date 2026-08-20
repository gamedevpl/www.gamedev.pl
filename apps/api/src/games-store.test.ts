import { describe, expect, it, vi } from 'vitest';
import {
  createGcsGamesStore,
  defaultVersionId,
  forbiddenDeliveryPathReason,
  InvalidUploadError,
  MAX_UPLOAD_BYTES,
  validateSourceUpload,
  type SourceFile,
} from './games-store.js';

const HOW_TO_PLAY = {
  goal: { en: 'Survive', pl: 'Przetrwaj' },
  hint: { en: 'Keep moving', pl: 'Nie zatrzymuj się' },
};

// MINIMAL minus GAME.json, for tests that swap in their own manifest.
const MINIMAL_WITHOUT_GAME_JSON: SourceFile[] = [
  { path: 'SPEC.md', content: '---\ntitle: A game\n---\n' },
  { path: 'game.ts', content: 'export {};' },
  // The behavioural golden is part of a minimal delivery, not an extra: without it the
  // gate stops at the trace stage and the version can never reach a verdict.
  { path: 'TRACE.json', content: '{"samples":[]}' },
  // Same status as the golden above, for the same reason: the harness's Check 26 refuses
  // a game that does not declare its progress landmarks, so a delivery without this one
  // reaches validate and stops there having produced nothing.
  { path: 'PLAYTEST.json', content: '{"expectProgress":["round-start"]}' },
  // Check 28's play policy. Allowed (and present on the happy path); not hard-required
  // at upload until in-flight workspaces drain — see ALLOWED_SOURCE_FILES note.
  { path: 'AGENT.json', content: '{"policy":"capture"}' },
];

// index.html is refused now — howToPlay is the only markup source.
const MINIMAL: SourceFile[] = [
  ...MINIMAL_WITHOUT_GAME_JSON,
  { path: 'GAME.json', content: JSON.stringify({ engine: { modules: [] }, howToPlay: HOW_TO_PLAY }) },
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
    expect(() => validateSourceUpload([{ path: 'game.ts', content: 'x' }])).toThrow(/SPEC.md is required/);
  });

  describe('GAME.json howToPlay', () => {
    // A fresh write is refused elsewhere; this stays permissive for carry-forward.
    it('still accepts a delivery that ships a real index.html and no howToPlay', () => {
      const files = [...MINIMAL_WITHOUT_GAME_JSON, { path: 'index.html', content: '<canvas id="game"></canvas>' }];
      expect(validateSourceUpload(files).map((file) => file.path)).toContain('index.html');
    });

    it('accepts a delivery that declares howToPlay instead of shipping index.html', () => {
      expect(validateSourceUpload(MINIMAL).map((file) => file.path)).not.toContain('index.html');
    });

    it('treats a whitespace-only index.html as absent, same as getGameSources does', () => {
      expect(() =>
        validateSourceUpload([
          ...MINIMAL_WITHOUT_GAME_JSON,
          { path: 'index.html', content: '   \n  ' },
          { path: 'GAME.json', content: JSON.stringify({ engine: { modules: [] } }) },
        ]),
      ).toThrow(/GAME\.json\.howToPlay is required/);
    });

    it('refuses a delivery with neither', () => {
      expect(() =>
        validateSourceUpload([
          ...MINIMAL_WITHOUT_GAME_JSON,
          { path: 'GAME.json', content: JSON.stringify({ engine: { modules: [] } }) },
        ]),
      ).toThrow(/GAME\.json\.howToPlay is required.*do not author index\.html/i);
    });

    it('refuses a howToPlay missing the pair the generator needs', () => {
      // goal without hint cannot produce a body
      expect(() =>
        validateSourceUpload([
          ...MINIMAL_WITHOUT_GAME_JSON,
          {
            path: 'GAME.json',
            content: JSON.stringify({ engine: { modules: [] }, howToPlay: { goal: HOW_TO_PLAY.goal } }),
          },
        ]),
      ).toThrow(/GAME\.json\.howToPlay is required/);
    });

    it('refuses a schema-only delivery whose GAME.json does not parse', () => {
      expect(() =>
        validateSourceUpload([...MINIMAL_WITHOUT_GAME_JSON, { path: 'GAME.json', content: '{"howToPlay": {' }]),
      ).toThrow(/GAME\.json\.howToPlay is required/);
    });

    it('refuses a howToPlay whose goal/hint are truthy but not {en, pl} strings', () => {
      // `'goal' in howToPlay` used to pass this, crashing deep in the assembler
      expect(() =>
        validateSourceUpload([
          ...MINIMAL_WITHOUT_GAME_JSON,
          {
            path: 'GAME.json',
            content: JSON.stringify({ engine: { modules: [] }, howToPlay: { goal: true, hint: HOW_TO_PLAY.hint } }),
          },
        ]),
      ).toThrow(/GAME\.json\.howToPlay is required/);
    });
  });

  describe('`any` refusal', () => {
    // Refused at upload rather than at the gate: the games repo fails the same source on
    // validate Check 37, and hearing it now costs the agent a tool call instead of a round.
    it('refuses the `any` type in a delivered module, on preview and publish', () => {
      const delivery = [...MINIMAL, { path: 'game/render.ts', content: 'export function paint(kit: any) {}\n' }];
      for (const mode of ['preview', 'publish'] as const) {
        expect(() => validateSourceUpload(delivery, mode)).toThrow(/game\/render\.ts:1:28 uses the `any` type/);
      }
    });

    it('names how many more it found, so a wholesale fix is one pass', () => {
      const delivery = [
        ...MINIMAL,
        { path: 'game/render.ts', content: 'export function paint(kit: any, draw: any) {}\n' },
      ];
      expect(() => validateSourceUpload(delivery)).toThrow(/and 1 more/);
    });

    it('carries the refusal kind, so the round can count it', () => {
      const delivery = [...MINIMAL, { path: 'game/render.ts', content: 'const x = y as any;\n' }];
      try {
        validateSourceUpload(delivery);
        expect.unreachable('expected the delivery to be refused');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidUploadError);
        expect((error as InvalidUploadError).kind).toBe('any-type');
      }
    });

    it('leaves the word alone in prose and data', () => {
      const delivery = [
        ...MINIMAL,
        { path: 'game/render.ts', content: "// any of these\nexport const facing = 'any';\n" },
      ];
      // A JSON file is not scanned at all: `any` is only a type in TypeScript.
      const withJsonKey = delivery.map((file) =>
        file.path === 'GAME.json'
          ? { path: 'GAME.json', content: JSON.stringify({ engine: { modules: [] }, howToPlay: HOW_TO_PLAY, any: 1 }) }
          : file,
      );
      expect(validateSourceUpload(withJsonKey)).toHaveLength(withJsonKey.length);
    });

    it('is not fooled by `/` right after `++`/`--` into reading the rest of the line as a regex', () => {
      // Without disambiguating postfix/prefix increment from a lone `+`/`-`, this `/`
      // reads as opening a regex — which would swallow the `any` and let it upload clean.
      const delivery = [
        ...MINIMAL,
        { path: 'game/model.ts', content: 'export const ratio = count++ / (total as any);\n' },
      ];
      expect(() => validateSourceUpload(delivery)).toThrow(/game\/model\.ts.*uses the `any` type/);
    });
  });

  describe('cross-file symbol link check', () => {
    const brokenPair: SourceFile[] = [
      {
        path: 'game/runtime.ts',
        content: `import { WIN_SCORE, spawnDebris } from './model.js';\nexport function tick() {\n  return WIN_SCORE + spawnDebris();\n}\n`,
      },
      {
        path: 'game/model.ts',
        content: `export type Round = { score: number };\nexport const START = 0;\n`,
      },
    ];

    it('refuses the WIN_SCORE/spawnDebris delivery on preview and publish', () => {
      for (const mode of ['preview', 'publish'] as const) {
        expect(() => validateSourceUpload([...MINIMAL, ...brokenPair], mode)).toThrow(
          /game\/model\.ts does not export `WIN_SCORE`, `spawnDebris`/,
        );
      }
    });

    it('still accepts a valid multi-file delivery', () => {
      const delivery = [
        ...MINIMAL.filter((f) => f.path !== 'game.ts'),
        {
          path: 'game.ts',
          content: `import { publicName, Helper } from './lib.js';\nexport { publicName, Helper };\n`,
        },
        {
          path: 'lib.ts',
          content: `const localName = 1;\nexport { localName as publicName };\nexport class Helper {}\n`,
        },
      ];
      expect(validateSourceUpload(delivery)).toHaveLength(delivery.length);
      expect(validateSourceUpload(delivery, 'preview')).toHaveLength(delivery.length);
    });

    it('does not refuse bare engine imports', () => {
      const delivery = [
        ...MINIMAL.filter((f) => f.path !== 'game.ts'),
        {
          path: 'game.ts',
          content: `import { createGame } from '@gamedevpl/game-kit';\nexport const g = createGame;\n`,
        },
      ];
      expect(validateSourceUpload(delivery)).toHaveLength(delivery.length);
    });
  });

  it('catches an enabled audio module without selected sounds before the gate', () => {
    expect(() =>
      validateSourceUpload(
        [
          ...MINIMAL_WITHOUT_GAME_JSON,
          {
            path: 'GAME.json',
            content: JSON.stringify({ engine: { modules: ['audio'] }, audio: {}, howToPlay: HOW_TO_PLAY }),
          },
        ],
        'preview',
      ),
    ).toThrow(/audio\.sounds/);
  });

  it('rejects a preview manifest without engine.modules before smoke runs', () => {
    expect(() =>
      validateSourceUpload(
        [...MINIMAL_WITHOUT_GAME_JSON, { path: 'GAME.json', content: JSON.stringify({ howToPlay: HOW_TO_PLAY }) }],
        'preview',
      ),
    ).toThrow(/engine\.modules as an array/);
  });

  it('catches an audio module with sounds but no music, as the assembler would', () => {
    expect(() =>
      validateSourceUpload(
        [
          ...MINIMAL_WITHOUT_GAME_JSON,
          {
            path: 'GAME.json',
            content: JSON.stringify({
              engine: { modules: ['audio'] },
              audio: { sounds: ['win'] },
              howToPlay: HOW_TO_PLAY,
            }),
          },
        ],
        'preview',
      ),
    ).toThrow(/audio\.music/);
    expect(
      validateSourceUpload(
        [
          ...MINIMAL_WITHOUT_GAME_JSON,
          {
            path: 'GAME.json',
            content: JSON.stringify({
              engine: { modules: ['audio'] },
              audio: { sounds: ['win'], music: 'bright-chase' },
              howToPlay: HOW_TO_PLAY,
            }),
          },
        ],
        'preview',
      ).length,
    ).toBeGreaterThan(0);
  });

  it('points the audio refusal at the catalog instead of offering to drop the module', () => {
    const files = [
      ...MINIMAL_WITHOUT_GAME_JSON,
      {
        path: 'GAME.json',
        content: JSON.stringify({ engine: { modules: ['audio'] }, audio: {}, howToPlay: HOW_TO_PLAY }),
      },
    ];
    expect(() => validateSourceUpload(files, 'preview')).toThrow(/Audio catalog/);
    try {
      validateSourceUpload(files, 'preview');
    } catch (error) {
      expect((error as Error).message).not.toMatch(/or remove the audio module/);
    }
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

  it('preview mode allows iterating without TRACE/PLAYTEST seals', () => {
    const draft = MINIMAL.filter((f) => f.path !== 'TRACE.json' && f.path !== 'PLAYTEST.json');
    expect(() => validateSourceUpload(draft, 'publish')).toThrow(/TRACE\.json is required/);
    expect(validateSourceUpload(draft, 'preview').map((f) => f.path)).not.toContain('TRACE.json');
    expect(validateSourceUpload(draft, 'preview').map((f) => f.path)).toContain('game.ts');
  });

  it('accepts the agent-play contract without blocking pre-companion submit tools', () => {
    // The bug this PR fixes is "path not deliverable" for AGENT.json — accepting the
    // file is the unblock. Hard-requiring it would 400 in-flight workspaces that still
    // ship the old submit tool; the gate's Check 28 covers absence until those drain.
    expect(validateSourceUpload(MINIMAL).map((f) => f.path)).toContain('AGENT.json');
    expect(validateSourceUpload(MINIMAL.filter((f) => f.path !== 'AGENT.json'))).toHaveLength(MINIMAL.length - 1);
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

  it('accept/reject matrix for the delivery filename allowlist', () => {
    // GAME.json isn't repeated here — MINIMAL already carries one (duplicate-path).
    const accept = [
      'music.json',
      'CAPTURE.json',
      'style.css',
      'game/loop.ts',
      'game/systems/physics.ts',
      'entities/player.ts',
    ];
    for (const path of accept) {
      expect(
        validateSourceUpload([...MINIMAL, { path, content: path.endsWith('.json') ? '{}' : 'export {};' }]).map(
          (f) => f.path,
        ),
      ).toContain(path);
    }

    const reject = [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'tsconfig.build.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      '.env',
      '.github/workflows/ci.yml',
      'vite.config.ts', // .ts but config basename — wait, EXTRA allows *.ts; forbid by basename
      'setup.js',
      'index.mjs',
      'run.cjs',
      'media/opening.png',
      'Dockerfile',
      'script.sh',
    ];
    for (const path of reject) {
      const reason = forbiddenDeliveryPathReason(path);
      // Config-shaped paths must name themselves in the refusal.
      if (reason) {
        expect(reason).toContain(path);
        expect(() => validateSourceUpload([...MINIMAL, { path, content: 'x' }])).toThrow(
          new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
        );
      } else {
        // Non-config leftovers (e.g. notes) still refuse via the allowlist.
        expect(() => validateSourceUpload([...MINIMAL, { path, content: 'x' }])).toThrow(/path not deliverable/);
      }
    }
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
  const generations = new Map<string, number>();
  const impl = (async (url: string | URL, init: RequestInit = {}) => {
    const href = String(url);
    if (init.method === 'POST') {
      const parsed = new URL(href);
      const name = decodeURIComponent(parsed.searchParams.get('name') ?? '');
      const ifMatch = parsed.searchParams.get('ifGenerationMatch');
      const current = generations.get(name) ?? 0;
      if (ifMatch !== null && Number(ifMatch) !== current) {
        return new Response('Precondition Failed', { status: 412 });
      }
      objects.set(name, Buffer.from(init.body as Uint8Array));
      const next = current + 1;
      generations.set(name, next);
      return new Response(JSON.stringify({ generation: String(next) }), { status: 200 });
    }
    if (init.method === 'DELETE') {
      const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
      objects.delete(name);
      generations.delete(name);
      return new Response(null, { status: 200 });
    }
    // Delimiter listing (`/o?prefix=...&delimiter=/`) — answers with the sub-prefixes,
    // like GCS does, so listVersions can be exercised against the same object map.
    if (!href.includes('/o/')) {
      const parsed = new URL(href);
      const prefix = parsed.searchParams.get('prefix') ?? '';
      const prefixes = new Set<string>();
      for (const name of objects.keys()) {
        if (!name.startsWith(prefix)) continue;
        const rest = name.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash !== -1) prefixes.add(`${prefix}${rest.slice(0, slash + 1)}`);
      }
      return new Response(JSON.stringify({ prefixes: [...prefixes] }), { status: 200 });
    }
    const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
    const body = objects.get(name);
    if (!body) return new Response('', { status: 404 });
    const generation = String(generations.get(name) ?? 1);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: { 'x-goog-generation': generation },
    });
  }) as unknown as typeof fetch;
  return { impl, objects, generations };
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
    const { version } = await store.putCandidateSources({
      slug: 'g',
      issueNumber: 1,
      roundGeneration: 4,
      files: MINIMAL,
    });

    await store.putGateResult('g', version, { green: false, report: '3 checks failed' });

    expect((await store.getManifest('g', version))?.gate).toMatchObject({ green: false, report: '3 checks failed' });
    expect((await store.getManifest('g', version))?.roundGeneration).toBe(4);
  });

  it('lists versions newest first, skipping directories without a manifest', async () => {
    const { impl, objects } = stubGcs();
    let tick = 0;
    const store = createGcsGamesStore({ ...base, fetchImpl: impl, versionId: () => `v${++tick}` });
    await store.putCandidateSources({ slug: 'g', issueNumber: 1, files: MINIMAL });
    await store.putCandidateSources({ slug: 'g', issueNumber: 2, files: MINIMAL });
    // An interrupted upload: source objects landed, the manifest never did.
    objects.set('games/g/versions/v9/source/game.ts', Buffer.from('x'));

    const versions = await store.listVersions('g');

    expect(versions.map((manifest) => manifest.version)).toEqual(['v2', 'v1']);
    expect(versions[0]).toMatchObject({ issueNumber: 2 });

    const limited = await store.listVersions('g', { limit: 1 });
    expect(limited.map((manifest) => manifest.version)).toEqual(['v2']);

    await expect(store.listVersions('../evil')).rejects.toThrow(InvalidUploadError);
    expect(await store.listVersions('never-delivered')).toEqual([]);
  });

  it('stages files one-by-one and assembles them for finalize', async () => {
    const { impl, objects } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    const draft = MINIMAL.filter((f) => f.path !== 'TRACE.json' && f.path !== 'PLAYTEST.json');

    for (const file of draft) {
      await store.putStagedSourceFile({
        slug: 'g',
        issueNumber: 7,
        roundGeneration: 1,
        path: file.path,
        content: file.content,
      });
    }

    const listed = await store.listStagedSources({ slug: 'g', issueNumber: 7, roundGeneration: 1 });
    expect(listed.files.map((f) => f.path).sort()).toEqual(draft.map((f) => f.path).sort());
    expect(objects.has('games/g/staging/7/g1/source/game.ts')).toBe(true);
    expect(await store.getStagedSourceFile({ slug: 'g', issueNumber: 7, roundGeneration: 1, path: 'game.ts' })).toBe(
      draft.find((f) => f.path === 'game.ts')!.content,
    );
    expect(
      await store.getStagedSourceFile({ slug: 'g', issueNumber: 7, roundGeneration: 1, path: 'missing.ts' }),
    ).toBeNull();

    const assembled = await store.getStagedSourceFiles({ slug: 'g', issueNumber: 7, roundGeneration: 1 });
    const { version } = await store.putCandidateSources({
      slug: 'g',
      issueNumber: 7,
      files: assembled,
      mode: 'preview',
    });
    expect(version).toBeTruthy();

    await store.clearStagedSources({ slug: 'g', issueNumber: 7, roundGeneration: 1 });
    expect((await store.listStagedSources({ slug: 'g', issueNumber: 7, roundGeneration: 1 })).files).toEqual([]);
  });

  it('refuses to stage a non-blank index.html, but a blank one is a no-op', async () => {
    const { impl } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });

    await expect(
      store.putStagedSourceFile({
        slug: 'g',
        issueNumber: 7,
        roundGeneration: 1,
        path: 'index.html',
        content: '<canvas id="game"></canvas>',
      }),
    ).rejects.toThrow(/index\.html cannot be staged or patched/);

    await expect(
      store.putStagedSourceFile({
        slug: 'g',
        issueNumber: 7,
        roundGeneration: 1,
        path: 'index.html',
        content: '   \n  ',
      }),
    ).resolves.toMatchObject({ path: 'index.html' });
  });

  it('tombstones a staged path instead of delivering it as an empty file', async () => {
    const { impl, objects } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });

    await store.putStagedSourceFile({
      slug: 'g',
      issueNumber: 7,
      roundGeneration: 1,
      path: 'game/old-module.ts',
      content: 'export const dead = 1;',
    });
    expect(objects.has('games/g/staging/7/g1/source/game/old-module.ts')).toBe(true);

    const deleted = await store.deleteStagedSourceFile({
      slug: 'g',
      issueNumber: 7,
      roundGeneration: 1,
      path: 'game/old-module.ts',
    });
    expect(deleted.path).toBe('game/old-module.ts');
    // Never re-read as content.
    expect(objects.has('games/g/staging/7/g1/source/game/old-module.ts')).toBe(false);

    const listed = await store.listStagedSources({ slug: 'g', issueNumber: 7, roundGeneration: 1 });
    // CE-04: every staging write is now stamped with who wrote it; omitted here defaults to 'agent'.
    expect(listed.files).toEqual([{ path: 'game/old-module.ts', bytes: 0, deleted: true, stagedBy: 'agent' }]);

    const assembled = await store.getStagedSourceFiles({ slug: 'g', issueNumber: 7, roundGeneration: 1 });
    expect(assembled).toEqual([{ path: 'game/old-module.ts', content: '', deleted: true }]);

    expect(
      await store.getStagedSourceFile({ slug: 'g', issueNumber: 7, roundGeneration: 1, path: 'game/old-module.ts' }),
    ).toBeNull();
  });

  it('retries staging manifest writes when a concurrent update wins the generation race', async () => {
    const objects = new Map<string, Buffer>();
    const generations = new Map<string, number>();
    let manifestWrites = 0;
    const impl = (async (url: string | URL, init: RequestInit = {}) => {
      const href = String(url);
      if (init.method === 'POST') {
        const parsed = new URL(href);
        const name = decodeURIComponent(parsed.searchParams.get('name') ?? '');
        if (name.endsWith('/manifest.json')) {
          manifestWrites += 1;
          // First attempt pretends another writer landed first.
          if (manifestWrites === 1) {
            return new Response('Precondition Failed', { status: 412 });
          }
        }
        const ifMatch = parsed.searchParams.get('ifGenerationMatch');
        const current = generations.get(name) ?? 0;
        if (ifMatch !== null && Number(ifMatch) !== current) {
          return new Response('Precondition Failed', { status: 412 });
        }
        objects.set(name, Buffer.from(init.body as Uint8Array));
        const next = current + 1;
        generations.set(name, next);
        return new Response('{}', { status: 200 });
      }
      if (init.method === 'DELETE') {
        const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
        objects.delete(name);
        generations.delete(name);
        return new Response(null, { status: 200 });
      }
      const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
      // After the first 412, the concurrent writer's manifest appears for the retry read.
      if (name.endsWith('/manifest.json') && manifestWrites >= 1 && !objects.has(name)) {
        const concurrent = {
          slug: 'g',
          issueNumber: 7,
          roundGeneration: 1,
          updatedAt: '2026-07-30T10:00:00.000Z',
          files: [{ path: 'SPEC.md', bytes: 3 }],
          totalBytes: 3,
        };
        objects.set(name, Buffer.from(JSON.stringify(concurrent)));
        generations.set(name, 1);
      }
      const body = objects.get(name);
      if (!body) return new Response('', { status: 404 });
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: { 'x-goog-generation': String(generations.get(name) ?? 1) },
      });
    }) as unknown as typeof fetch;

    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    const result = await store.putStagedSourceFile({
      slug: 'g',
      issueNumber: 7,
      roundGeneration: 1,
      path: 'game.ts',
      content: 'export {};',
    });

    expect(manifestWrites).toBeGreaterThanOrEqual(2);
    expect(result.files.map((f) => f.path).sort()).toEqual(['SPEC.md', 'game.ts']);
  });

  it('records kit_outdated on a preview-lane check without touching gate', async () => {
    const { impl } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    const draft = MINIMAL.filter((f) => f.path !== 'TRACE.json' && f.path !== 'PLAYTEST.json');
    const { version } = await store.putCandidateSources({
      slug: 'g',
      issueNumber: 1,
      files: draft,
      mode: 'preview',
    });

    await store.putPreviewGateResult('g', version, {
      green: false,
      report: 'kitEngineRef outside supported window',
      status: 'kit_outdated',
    });

    const manifest = await store.getManifest('g', version);
    expect(manifest?.gate).toBeUndefined();
    expect(manifest?.previewGate).toMatchObject({
      green: false,
      report: 'kitEngineRef outside supported window',
      status: 'kit_outdated',
    });
  });

  it('records mid-gate progress and clears it when a verdict lands', async () => {
    const { impl } = stubGcs();
    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    const { version } = await store.putCandidateSources({ slug: 'g', issueNumber: 1, files: MINIMAL });

    await store.putGateProgress('g', version, {
      lane: 'preview',
      stage: 'typecheck',
      index: 2,
      total: 6,
      at: '2026-08-07T12:00:00.000Z',
    });
    expect((await store.getManifest('g', version))?.gateProgress?.stage).toBe('typecheck');

    await store.putPreviewGateResult('g', version, { green: true, report: 'ok' });
    expect((await store.getManifest('g', version))?.gateProgress).toBeUndefined();
  });

  it('does not let a raced progress write erase a gate verdict', async () => {
    const objects = new Map<string, Buffer>();
    const generations = new Map<string, number>();
    let conditionedWrites = 0;
    const impl = (async (url: string | URL, init: RequestInit = {}) => {
      const href = String(url);
      if (init.method === 'POST') {
        const parsed = new URL(href);
        const name = decodeURIComponent(parsed.searchParams.get('name') ?? '');
        const ifMatch = parsed.searchParams.get('ifGenerationMatch');
        const current = generations.get(name) ?? 0;
        // First conditioned write: inject verdict, then 412 the stale put.
        if (
          ifMatch !== null &&
          name.includes('/versions/') &&
          name.endsWith('/manifest.json') &&
          ++conditionedWrites === 1
        ) {
          const baseManifest = JSON.parse(objects.get(name)!.toString('utf8'));
          delete baseManifest.gateProgress;
          baseManifest.gate = { green: true, ranAt: '2026-08-07T12:01:00.000Z', report: 'ok' };
          objects.set(name, Buffer.from(JSON.stringify(baseManifest)));
          generations.set(name, current + 1);
          return new Response('Precondition Failed', { status: 412 });
        }
        if (ifMatch !== null && Number(ifMatch) !== current) {
          return new Response('Precondition Failed', { status: 412 });
        }
        objects.set(name, Buffer.from(init.body as Uint8Array));
        generations.set(name, current + 1);
        return new Response('{}', { status: 200 });
      }
      if (!href.includes('/o/')) {
        return new Response(JSON.stringify({ prefixes: [] }), { status: 200 });
      }
      const name = decodeURIComponent(href.split('/o/')[1].split('?')[0]);
      const body = objects.get(name);
      if (!body) return new Response('', { status: 404 });
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: { 'x-goog-generation': String(generations.get(name) ?? 1) },
      });
    }) as unknown as typeof fetch;

    const store = createGcsGamesStore({ ...base, fetchImpl: impl });
    const { version } = await store.putCandidateSources({ slug: 'g', issueNumber: 1, files: MINIMAL });
    const manifestName = `games/g/versions/${version}/manifest.json`;
    const genBefore = generations.get(manifestName) ?? 0;

    await store.putGateProgress('g', version, {
      lane: 'publish',
      stage: 'validate',
      index: 5,
      total: 6,
      at: '2026-08-07T12:00:30.000Z',
    });

    const manifest = JSON.parse(objects.get(manifestName)!.toString('utf8'));
    expect(manifest.gate).toMatchObject({ green: true, report: 'ok' });
    expect(manifest.gateProgress).toBeUndefined();
    expect(conditionedWrites).toBe(1);
    // Only the injected verdict bumped generation.
    expect(generations.get(manifestName)).toBe(genBefore + 1);
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
