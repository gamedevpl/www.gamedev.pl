import { describe, expect, it, vi } from 'vitest';
import {
  createStagedPreviewPublisher,
  hasPlayableOverlay,
  overlayGameSources,
  STAGED_PREVIEW_LABEL,
  STAGED_PREVIEW_LABEL_PL,
  type StagedPreviewOptions,
} from './staged-preview.js';

/**
 * The publisher's whole job is to answer "is there something to show yet?" about a tree
 * nobody has verified. So these tests care about two things: that a half-staged tree is a
 * quiet no rather than an error, and that when it does publish, what lands is the game the
 * *staged* files describe rather than the base they started from.
 */

const GAME_SOURCES = {
  indexHtml: '<div id="game-root"></div>',
  gameJs: 'console.log("play");',
  styleCss: 'body{margin:0}',
  title: 'Comet Courier',
};

const PLAYABLE_TREE = [
  { path: 'index.html', content: '<div id="game-root"></div>' },
  { path: 'game.ts', content: 'export {};' },
  { path: 'style.css', content: 'body{margin:0}' },
  { path: 'GAME.json', content: '{"modules":[]}' },
];

type SourceFile = { path: string; content: string };

type HarnessInput = {
  /** The job record the store answers with. */
  record?: Record<string, unknown> | null;
  /** What the round has staged so far. */
  staged?: SourceFile[];
  /** The version this round improves, when there is one. */
  delivered?: { version: string; files: SourceFile[] } | null;
  published?: boolean;
  /** Stands in for the assembler; throw to model a tree that does not compile. */
  assemble?: () => Promise<typeof GAME_SOURCES>;
} & Partial<
  Pick<StagedPreviewOptions, 'debounceMs' | 'minGapMs' | 'maxBytes' | 'maxWaitMs' | 'busyRetryMs' | 'onPublished'>
>;

function harness(input: HarnessInput = {}) {
  const record =
    input.record === undefined ? { issueNumber: 7, slug: 'comet-courier', roundGeneration: 2 } : input.record;
  const delivered = input.delivered ?? null;
  const previews: Array<Record<string, unknown>> = [];
  const getGameSources = vi.fn(input.assemble ?? (async () => GAME_SOURCES));
  const putDerivedArtifact = vi.fn(async () => {});
  const log = { warn: vi.fn(), error: vi.fn() };

  const options: StagedPreviewOptions = {
    store: {
      getSubmission: async () => record,
      getPublication: async () =>
        input.published && delivered
          ? { slug: 'comet-courier', state: 'published', currentVersion: delivered.version }
          : null,
      appendBuildPreview: async (issueNumber: number, preview: Record<string, unknown>) => {
        previews.push({ issueNumber, ...preview });
        return { ...preview, id: `p${previews.length}`, createdAt: '2026-01-01T00:00:00.000Z' };
      },
      pruneBuildPreviews: async () => 0,
    } as unknown as StagedPreviewOptions['store'],
    gamesStore: {
      getStagedSourceFiles: async () => input.staged ?? PLAYABLE_TREE,
      getManifest: async () => (delivered ? { sourceFiles: delivered.files.map((file) => file.path) } : null),
      getSourceFile: async (_slug: string, _version: string, path: string) =>
        delivered?.files.find((file) => file.path === path)?.content ?? null,
      putDerivedArtifact,
    } as unknown as StagedPreviewOptions['gamesStore'],
    githubClient: { getGameSources } as unknown as StagedPreviewOptions['githubClient'],
    engineRef: 'main',
    log,
    ...(input.debounceMs !== undefined ? { debounceMs: input.debounceMs } : {}),
    ...(input.minGapMs !== undefined ? { minGapMs: input.minGapMs } : {}),
    ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
    ...(input.maxWaitMs !== undefined ? { maxWaitMs: input.maxWaitMs } : {}),
    ...(input.busyRetryMs !== undefined ? { busyRetryMs: input.busyRetryMs } : {}),
    ...(input.onPublished ? { onPublished: input.onPublished } : {}),
  };

  return { publisher: createStagedPreviewPublisher(options), previews, getGameSources, putDerivedArtifact, log };
}

/** The stored preview, decoded back to the document a creator would be served. */
function decoded(preview: Record<string, unknown>): string {
  return Buffer.from(String(preview.data), 'base64').toString('utf8');
}

describe('overlayGameSources', () => {
  it('lets a staged file win over the delivered version and the seed', () => {
    const overlay = overlayGameSources({
      seed: [{ path: 'game.ts', content: 'seed' }],
      delivered: [{ path: 'game.ts', content: 'delivered' }],
      staged: [{ path: 'game.ts', content: 'staged' }],
    });

    expect(overlay['game.ts']).toBe('staged');
  });

  it('keeps base files the agent has not staged, so a one-file edit still renders a game', () => {
    // The improvement-round shape: the agent stages the one module it changed and nothing
    // else. Without the delivered layer this would render a game with one file in it.
    const overlay = overlayGameSources({
      delivered: [
        { path: 'index.html', content: 'base html' },
        { path: 'game.ts', content: 'base entry' },
      ],
      staged: [{ path: 'game.ts', content: 'edited entry' }],
    });

    expect({ ...overlay }).toEqual({ 'index.html': 'base html', 'game.ts': 'edited entry' });
  });

  it('prefers a delivered file over a seed one — the seed is the older of the two', () => {
    const overlay = overlayGameSources({
      seed: [{ path: 'style.css', content: 'seed css' }],
      delivered: [{ path: 'style.css', content: 'delivered css' }],
    });

    expect(overlay['style.css']).toBe('delivered css');
  });

  it('drops a path a staged tombstone marks deleted, instead of overwriting it', () => {
    const overlay = overlayGameSources({
      delivered: [{ path: 'index.html', content: 'stale hand-authored html' }],
      staged: [{ path: 'index.html', content: '', deleted: true }],
    });

    expect('index.html' in overlay).toBe(false);
  });

  it('cannot be poisoned by a path named after an Object prototype member', () => {
    // Overlay keys are an agent's own path strings. A null-prototype map is what stops
    // `constructor` resolving to a function that would later read as file content.
    const overlay = overlayGameSources({ staged: [{ path: 'game.ts', content: 'x' }] });

    expect(overlay['constructor']).toBeUndefined();
    expect(hasPlayableOverlay(overlay)).toBe(false);
  });
});

describe('hasPlayableOverlay', () => {
  it('requires every entry file the assembler reads from the game itself', () => {
    expect(hasPlayableOverlay(Object.fromEntries(PLAYABLE_TREE.map((file) => [file.path, file.content])))).toBe(true);
  });

  it('refuses a tree still missing one of them', () => {
    expect(hasPlayableOverlay(Object.fromEntries(PLAYABLE_TREE.slice(0, 3).map((f) => [f.path, f.content])))).toBe(
      false,
    );
  });

  it('treats an empty file as not staged yet', () => {
    const empty = Object.fromEntries(PLAYABLE_TREE.map((f) => [f.path, f.path === 'GAME.json' ? '' : f.content]));
    expect(hasPlayableOverlay(empty)).toBe(false);
  });

  it('treats a whitespace-only index.html as absent, same as getGameSources does', () => {
    // A whitespace-only file must not short-circuit the howToPlay fallback check.
    const overlay = {
      ...Object.fromEntries(PLAYABLE_TREE.map((f) => [f.path, f.content])),
      'index.html': '   \n  ',
      'GAME.json': JSON.stringify({ howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Go', pl: 'Idź' } } }),
    };
    expect(hasPlayableOverlay(overlay)).toBe(true);
  });

  it('refuses a whitespace-only index.html with no howToPlay to fall back on', () => {
    const overlay = {
      ...Object.fromEntries(PLAYABLE_TREE.map((f) => [f.path, f.content])),
      'index.html': '   \n  ',
      'GAME.json': JSON.stringify({}),
    };
    expect(hasPlayableOverlay(overlay)).toBe(false);
  });

  it('accepts a tree with no index.html when GAME.json declares howToPlay', () => {
    // Markup may come from schema instead of a file
    const overlay = Object.fromEntries(
      PLAYABLE_TREE.filter((f) => f.path !== 'index.html').map((f) => [
        f.path,
        f.path === 'GAME.json'
          ? JSON.stringify({ howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Go', pl: 'Idź' } } })
          : f.content,
      ]),
    );

    expect(hasPlayableOverlay(overlay)).toBe(true);
  });

  it('accepts a tree with no style.css when GAME.json declares a theme', () => {
    const overlay = Object.fromEntries(
      PLAYABLE_TREE.filter((file) => file.path !== 'style.css').map((file) => [
        file.path,
        file.path === 'GAME.json'
          ? JSON.stringify({
              howToPlay: { goal: { en: 'Win', pl: 'Wygraj' }, hint: { en: 'Go', pl: 'Idź' } },
              theme: { accent: '#ffd56a' },
            })
          : file.content,
      ]),
    );

    expect(hasPlayableOverlay(overlay)).toBe(true);
  });

  it('refuses a tree with neither index.html nor a howToPlay to generate it from', () => {
    const overlay = Object.fromEntries(
      PLAYABLE_TREE.filter((f) => f.path !== 'index.html').map((f) => [f.path, f.content]),
    );

    expect(hasPlayableOverlay(overlay)).toBe(false);
  });

  it('treats a half-written GAME.json as not staged yet rather than throwing', () => {
    // Manifests arrive a byte at a time
    const overlay = Object.fromEntries(
      PLAYABLE_TREE.filter((f) => f.path !== 'index.html').map((f) => [
        f.path,
        f.path === 'GAME.json' ? '{"howToPlay": {"goal"' : f.content,
      ]),
    );

    expect(hasPlayableOverlay(overlay)).toBe(false);
  });
});

describe('createStagedPreviewPublisher', () => {
  it('assembles the staged tree and stores it as a playable preview', async () => {
    const { publisher, previews, getGameSources } = harness();

    expect(await publisher.publishNow(7)).toBe('published');
    expect(previews).toHaveLength(1);
    expect(previews[0]!.label).toBe(STAGED_PREVIEW_LABEL);
    expect(previews[0]!.slug).toBe('comet-courier');
    expect(decoded(previews[0]!)).toContain('<!doctype html>');
    expect(decoded(previews[0]!)).toContain('console.log("play")');
    // The engine half comes from the ref; every game file comes from the overlay, which
    // is what lets this render a game that lives in no branch at all.
    expect(getGameSources).toHaveBeenCalledWith(
      'main',
      'comet-courier',
      expect.objectContaining({ 'game.ts': 'export {};' }),
    );
  });

  it('assembles a one-file owner edit against an already-delivered game (CE-12a)', async () => {
    // The exact shape the execution plan's CE-12a worried about: an owner stages one
    // file (not the three PLAYABLE_OVERLAY_FILES) on a game that has already delivered.
    // `overlayGameSources`'s own unit tests already prove the delivered layer fills the
    // gap (see 'keeps base files the agent has not staged' above) — this is the same
    // claim at the full `attempt()` level, through a real delivered-version read, to
    // confirm the fix CE-12a asked for was already true of the shipped layering and
    // nothing here needs to change to seed the buffer on a game's first *owner* write.
    const { publisher, previews } = harness({
      record: { issueNumber: 7, slug: 'comet-courier', roundGeneration: 2, deliveredVersion: 'v1' },
      staged: [{ path: 'game/render.ts', content: 'export const paint = () => {};' }],
      delivered: { version: 'v1', files: PLAYABLE_TREE },
    });

    expect(await publisher.publishNow(7)).toBe('published');
    expect(previews).toHaveLength(1);
  });

  it('marks the assembled document network-restricted, like every other unreviewed preview', async () => {
    const { publisher, previews } = harness();

    await publisher.publishNow(7);

    expect(decoded(previews[0]!)).toContain("default-src 'none'");
    expect(decoded(previews[0]!)).toContain('name="ai-generated"');
  });

  it('captions in the creator’s language when they submitted in one we author', async () => {
    const { publisher, previews } = harness({
      record: { issueNumber: 7, slug: 'comet-courier', roundGeneration: 2, locale: 'pl' },
    });

    expect(await publisher.publishNow(7)).toBe('published');
    expect(previews[0]!.labelLocalized).toBe(STAGED_PREVIEW_LABEL_PL);
    expect(previews[0]!.locale).toBe('pl');
  });

  it('says nothing when the round has staged nothing yet', async () => {
    const { publisher, previews } = harness({ staged: [] });

    expect(await publisher.publishNow(7)).toBe('not_staged');
    expect(previews).toHaveLength(0);
  });

  it('waits rather than publishing a tree that cannot make a game yet', async () => {
    // The normal state of a game being written: two of four entry files uploaded. This
    // must not reach the creator, and must not read as a failure either.
    const { publisher, previews, log, getGameSources } = harness({ staged: PLAYABLE_TREE.slice(0, 2) });

    expect(await publisher.publishNow(7)).toBe('incomplete');
    expect(previews).toHaveLength(0);
    expect(getGameSources).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('keeps the last good preview when the staged tree stops compiling', async () => {
    const { publisher, previews, log } = harness({
      assemble: async () => {
        throw new Error('game module not found: ./game/render.ts');
      },
    });

    expect(await publisher.publishNow(7)).toBe('failed');
    // Nothing stored, so whatever was on the rail before is still what the creator plays.
    expect(previews).toHaveLength(0);
    expect(log.warn).toHaveBeenCalled();
  });

  it('does not republish an identical document', async () => {
    const { publisher, previews } = harness();

    expect(await publisher.publishNow(7)).toBe('published');
    expect(await publisher.publishNow(7)).toBe('unchanged');
    expect(previews).toHaveLength(1);
  });

  it('publishes again once the staged tree actually changes', async () => {
    let js = 'console.log("one");';
    const { publisher, previews } = harness({ assemble: async () => ({ ...GAME_SOURCES, gameJs: js }) });

    await publisher.publishNow(7);
    js = 'console.log("two");';

    expect(await publisher.publishNow(7)).toBe('published');
    expect(previews).toHaveLength(2);
  });

  it('refuses a document over the stored-preview ceiling instead of failing the write', async () => {
    const { publisher, previews } = harness({
      maxBytes: 512,
      assemble: async () => ({ ...GAME_SOURCES, gameJs: 'x'.repeat(4096) }),
    });

    expect(await publisher.publishNow(7)).toBe('too_large');
    expect(previews).toHaveLength(0);
  });

  it('skips an abandoned job, and one that has no game yet', async () => {
    const abandoned = harness({
      record: { issueNumber: 7, slug: 'comet-courier', abandonedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(await abandoned.publisher.publishNow(7)).toBe('skipped');
    expect(abandoned.previews).toHaveLength(0);

    const slugless = harness({ record: { issueNumber: 7 } });
    expect(await slugless.publisher.publishNow(7)).toBe('skipped');
    expect(slugless.previews).toHaveLength(0);
  });

  it('layers the staged file over the published version this round improves', async () => {
    // An improvement round stages one module against a live game. The base comes from the
    // store, not from a ref — a store-era game is in no branch to read.
    const { publisher, getGameSources } = harness({
      record: { issueNumber: 7, slug: 'comet-courier', roundGeneration: 3 },
      staged: [{ path: 'game.ts', content: 'edited entry' }],
      delivered: { version: 'v1', files: PLAYABLE_TREE },
      published: true,
    });

    expect(await publisher.publishNow(7)).toBe('published');
    expect(getGameSources).toHaveBeenCalledWith('main', 'comet-courier', {
      'index.html': '<div id="game-root"></div>',
      'game.ts': 'edited entry',
      'style.css': 'body{margin:0}',
      'GAME.json': '{"modules":[]}',
    });
  });

  it('layers over this round’s own last delivery before consulting what is published', async () => {
    const { publisher, getGameSources } = harness({
      record: { issueNumber: 7, slug: 'comet-courier', roundGeneration: 3, previewVersion: 'v9' },
      staged: [{ path: 'style.css', content: 'restyled' }],
      delivered: { version: 'v9', files: PLAYABLE_TREE },
    });

    expect(await publisher.publishNow(7)).toBe('published');
    expect(getGameSources).toHaveBeenCalledWith(
      'main',
      'comet-courier',
      expect.objectContaining({ 'style.css': 'restyled', 'game.ts': 'export {};' }),
    );
  });

  it('layers over the generated seed while the agent is still replacing it', async () => {
    const { publisher, getGameSources } = harness({
      record: {
        issueNumber: 7,
        slug: 'comet-courier',
        roundGeneration: 1,
        seed: { slug: 'comet-courier', files: PLAYABLE_TREE, references: [] },
      },
      staged: [{ path: 'game.ts', content: 'agent entry' }],
    });

    expect(await publisher.publishNow(7)).toBe('published');
    expect(getGameSources).toHaveBeenCalledWith(
      'main',
      'comet-courier',
      expect.objectContaining({ 'game.ts': 'agent entry', 'index.html': '<div id="game-root"></div>' }),
    );
  });

  it('busts the status cache so the creator’s next poll sees the new preview', async () => {
    const onPublished = vi.fn();
    const { publisher } = harness({ onPublished });

    await publisher.publishNow(7);

    expect(onPublished).toHaveBeenCalledWith(7);
  });

  it('collapses a burst of staged files into one assembly', async () => {
    vi.useFakeTimers();
    try {
      const { publisher, previews } = harness({ debounceMs: 50, minGapMs: 50 });

      // A dozen paths seconds apart is the ordinary MCP staging shape; only the state
      // after the last of them is worth assembling.
      for (let index = 0; index < 12; index++) publisher.schedule(7);
      await vi.advanceTimersByTimeAsync(500);

      expect(previews).toHaveLength(1);
      publisher.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the last file of a burst, not the first', async () => {
    // The failure this pins: an assembly armed by the *first* staged file fires on a
    // half-uploaded tree, answers `incomplete`, and then the gap floor holds the real
    // preview back — so a slowly-staged game reaches the creator later than if nothing
    // had been scheduled at all. Every stage must restart the clock.
    vi.useFakeTimers();
    try {
      const staged = [PLAYABLE_TREE[0]!];
      const { publisher, previews, getGameSources } = harness({
        staged,
        debounceMs: 1_000,
        minGapMs: 5_000,
        maxWaitMs: 60_000,
      });

      publisher.schedule(7);
      for (const file of PLAYABLE_TREE.slice(1)) {
        // Each new path lands before the previous one's debounce would have expired.
        await vi.advanceTimersByTimeAsync(600);
        staged.push(file);
        publisher.schedule(7);
      }

      // Still nothing: the tree was never quiet for a full debounce.
      expect(previews).toHaveLength(0);

      await vi.advanceTimersByTimeAsync(1_200);

      // One assembly, and it saw the whole tree rather than the first file of it.
      expect(previews).toHaveLength(1);
      expect(getGameSources).toHaveBeenCalledTimes(1);
      publisher.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-arms rather than dropping a file staged while an assembly is running', async () => {
    // publishNow answers `skipped` for a job already assembling. If the scheduler took
    // that for an answer, the last file of a burst could be lost outright — nothing
    // would ever assemble it, because the stage that would have retried never comes.
    vi.useFakeTimers();
    try {
      let release: () => void = () => {};
      const firstAssembly = new Promise<void>((resolve) => {
        release = resolve;
      });
      let calls = 0;
      const staged = [...PLAYABLE_TREE];
      const { publisher, previews } = harness({
        staged,
        debounceMs: 10,
        minGapMs: 10,
        busyRetryMs: 50,
        assemble: async () => {
          calls += 1;
          if (calls === 1) await firstAssembly;
          return { ...GAME_SOURCES, gameJs: `console.log(${calls});` };
        },
      });

      publisher.schedule(7);
      await vi.advanceTimersByTimeAsync(50);

      // A further file lands while that first assembly is still in flight.
      staged.push({ path: 'game/extra.ts', content: 'export {};' });
      publisher.schedule(7);
      await vi.advanceTimersByTimeAsync(50);

      release();
      await vi.advanceTimersByTimeAsync(500);

      expect(previews).toHaveLength(2);
      publisher.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still assembles during a staging stream that never goes quiet', async () => {
    // The cost of a trailing debounce: an agent staging steadily would restart it for as
    // long as it kept going. The max-wait is what stops the creator waiting out the whole
    // upload — which is the exact wait this module exists to end.
    vi.useFakeTimers();
    try {
      const { publisher, previews } = harness({ debounceMs: 1_000, minGapMs: 10, maxWaitMs: 3_000 });

      for (let index = 0; index < 12; index++) {
        publisher.schedule(7);
        await vi.advanceTimersByTimeAsync(500);
      }

      expect(previews.length).toBeGreaterThan(0);
      publisher.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds the next assembly until the minimum gap has passed', async () => {
    vi.useFakeTimers();
    try {
      let js = 'console.log("one");';
      const { publisher, previews } = harness({
        debounceMs: 10,
        minGapMs: 10_000,
        assemble: async () => ({ ...GAME_SOURCES, gameJs: js }),
      });

      publisher.schedule(7);
      await vi.advanceTimersByTimeAsync(100);
      expect(previews).toHaveLength(1);

      js = 'console.log("two");';
      publisher.schedule(7);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(previews).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(10_000);
      expect(previews).toHaveLength(2);
      publisher.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never throws from schedule — a staging receipt does not wait on a preview', async () => {
    vi.useFakeTimers();
    try {
      const { publisher, log } = harness({ debounceMs: 1, record: null });
      // `record: null` models the store answering with nothing; a store that is down
      // throws instead, and both must leave the caller's reply alone.
      expect(() => publisher.schedule(7)).not.toThrow();
      await vi.advanceTimersByTimeAsync(100);
      expect(log.error).not.toHaveBeenCalled();
      publisher.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('assembles and stores candidate preview without ref fallback', async () => {
    const { publisher, previews, getGameSources, putDerivedArtifact } = harness();
    const outcome = await publisher.publishCandidate({
      issueNumber: 7,
      slug: 'comet-courier',
      version: 'v20260823T120000Z-abcdef',
      roundGeneration: 2,
      files: PLAYABLE_TREE,
    });

    expect(outcome).toBe('published');
    expect(getGameSources).toHaveBeenCalledWith(
      'main',
      'comet-courier',
      expect.any(Object),
      { noRefFallback: true },
    );
    expect(putDerivedArtifact).toHaveBeenCalledWith(
      'comet-courier',
      'v20260823T120000Z-abcdef',
      'preview.html',
      expect.any(Buffer),
      'text/html; charset=utf-8',
    );
    expect(previews).toHaveLength(1);
    expect(previews[0].label).toBe(STAGED_PREVIEW_LABEL);
  });

  it('candidate assembly cancels pending debounce and sets digest preventing redundant staged assembly', async () => {
    vi.useFakeTimers();
    try {
      const { publisher, previews } = harness({ debounceMs: 1_000 });
      publisher.schedule(7);

      const outcome = await publisher.publishCandidate({
        issueNumber: 7,
        slug: 'comet-courier',
        version: 'v20260823T120000Z-abcdef',
        roundGeneration: 2,
        files: PLAYABLE_TREE,
      });
      expect(outcome).toBe('published');
      expect(previews).toHaveLength(1);

      // Advance past debounce — pending timer was cleared and digest matched, so no second preview
      await vi.advanceTimersByTimeAsync(2_000);
      expect(previews).toHaveLength(1);

      // Explicit publishNow on identical staged tree answers unchanged
      const stagedOutcome = await publisher.publishNow(7);
      expect(stagedOutcome).toBe('unchanged');
      expect(previews).toHaveLength(1);
      publisher.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
