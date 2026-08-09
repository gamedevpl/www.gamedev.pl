import { describe, expect, it, vi } from 'vitest';
import {
  appendKitDigest,
  compactKitDigestForPrompt,
  createGcsKitDigestLoader,
  selectApiBlocks,
  splitDeclarationBlocks,
} from './kit-digest.js';

describe('Creator Kit digest loader', () => {
  it('reads the digest matching the current engine ref and caches it', async () => {
    const readObject = vi
      .fn()
      .mockResolvedValueOnce(Buffer.from(JSON.stringify({ engineRef: 'abc123' })))
      .mockResolvedValueOnce(Buffer.from('# digest'));
    const loader = createGcsKitDigestLoader({ objectStore: { readObject } });

    expect(await loader.load()).toBe('# digest');
    expect(await loader.load()).toBe('# digest');
    expect(readObject).toHaveBeenCalledTimes(2);
    expect(readObject).toHaveBeenNthCalledWith(2, 'kits/abc123.digest.md');
  });

  it('fails open when the registry or digest is unavailable', async () => {
    const log = vi.fn();
    const loader = createGcsKitDigestLoader({
      objectStore: { readObject: vi.fn().mockRejectedValue(new Error('offline')) },
      log,
    });

    expect(await loader.load()).toBeUndefined();
    expect(log).toHaveBeenCalled();
  });

  it('retries after a transient read failure', async () => {
    const readObject = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(Buffer.from(JSON.stringify({ engineRef: 'abc123' })))
      .mockResolvedValueOnce(Buffer.from('# digest'));
    const loader = createGcsKitDigestLoader({ objectStore: { readObject } });

    expect(await loader.load()).toBeUndefined();
    expect(await loader.load()).toBe('# digest');
  });

  it('keeps the base prompt and appends the digest', () => {
    expect(appendKitDigest('base', 'rules')).toBe('base\n\n## Creator Kit digest\n\nrules');
    expect(appendKitDigest(undefined, 'rules')).toBe('## Creator Kit digest\n\nrules');
    expect(appendKitDigest('base', undefined)).toBe('base');
  });

  it('compacts the full artifact into core API and template guidance, keeping whole declarations that fit', () => {
    const full = [
      '## GameKit API surface',
      '~~~typescript',
      'interface GameKitInput { down(...keys: string[]): boolean; }',
      'interface GameKitParty { down(slot: number): boolean; }',
      'interface Unrelated { huge(): void; }',
      '~~~',
      '## Exemplar game',
      '### games/dodge-the-falling-rocks/game/runtime.ts',
      'GameKit.defineGame().input({ steer: "origin" }).start();',
      '### games/dodge-the-falling-rocks/game/other.ts',
      'other',
      '## File-shape rules',
      '- Keep files small.',
    ].join('\n');

    const compact = compactKitDigestForPrompt(full);

    expect(compact).toContain('GameKitInput');
    // A module family the old line-pattern allowlist could not name (party games were
    // invisible to platform agents until this was fixed) survives whole, not as an
    // unlabeled orphan line.
    expect(compact).toContain('interface GameKitParty { down(slot: number): boolean; }');
    expect(compact).toContain('game/runtime.ts');
    expect(compact).toContain('Keep files small.');
    // Nothing here is dropped — the fixture is well under the default budget, and whole-
    // block selection only omits when the budget genuinely forces it (see below).
    expect(compact).toContain('interface Unrelated');
  });

  it('names what a tight budget omits instead of silently dropping it', () => {
    // Interfaces sized like the real declaration file's, so a budget can be tight enough
    // to force an omission without the unrelated final byte-cap safety net (sized off the
    // whole document, header included) doing the truncating instead.
    const pad = 'x'.repeat(150);
    const full = [
      '## GameKit API surface',
      '~~~typescript',
      `interface GameKitApi { locale: string; ${pad} }`,
      `interface GameKitParty { down(slot: number): boolean; ${pad} }`,
      `interface GameKitZone { status: string; ${pad} }`,
      '~~~',
      '## Exemplar game',
      '### games/dodge-the-falling-rocks/game/runtime.ts',
      'GameKit.defineGame().start();',
      '## File-shape rules',
      '- Keep files small.',
    ].join('\n');

    const compact = compactKitDigestForPrompt(full, 800);

    // Party and zone survive whole — the failure this guards against dropped them (or
    // orphaned their members) below any generous-looking budget. What didn't fit (here,
    // GameKitApi) is named in an omission note rather than vanishing without a trace.
    expect(compact).toContain('interface GameKitParty');
    expect(compact).toContain('interface GameKitZone');
    expect(compact).toContain('Omitted for length');
    expect(compact).toContain('GameKitApi');
    expect(compact.trim().endsWith('- Keep files small.')).toBe(true);
  });

  it('splits a declaration file into whole top-level blocks by name', () => {
    const api = [
      'interface GameKitInput { down(): boolean; }',
      'type GameLifecycleState = "loading" | "playing";',
      'interface GameKitParty {',
      '  down(slot: number): boolean;',
      '}',
    ].join('\n');

    const blocks = splitDeclarationBlocks(api);

    expect(blocks.map((block) => block.name)).toEqual(['GameKitInput', 'GameLifecycleState', 'GameKitParty']);
    expect(blocks[2].text).toBe('interface GameKitParty {\n  down(slot: number): boolean;\n}');
  });

  it('selectApiBlocks gives every module family a block before any family gets a second one', () => {
    const blocks = splitDeclarationBlocks(
      [
        'interface GameKitParty { a: 1; }',
        'interface GameKitPartyExtra { b: 1; }',
        'interface GameKitZone { c: 1; }',
      ].join('\n'),
    );

    // A budget that fits exactly one of the three blocks still yields party over its own
    // second block being crowded out — zone would be starved entirely if the pass took
    // party's two blocks before zone's one, which is the head-of-file-bias bug this guards.
    const { kept, omitted } = selectApiBlocks(blocks, ['party', 'zone'], blocks[0].bytes + blocks[2].bytes);

    expect(kept.map((block) => block.name).sort()).toEqual(['GameKitParty', 'GameKitZone']);
    expect(omitted).toEqual(['GameKitPartyExtra']);
  });

  it('keeps the audio catalog, and keeps it ahead of what a byte cap truncates', () => {
    const full = [
      '## GameKit API surface',
      '~~~typescript',
      'interface GameKitInput { down(...keys: string[]): boolean; }',
      '~~~',
      '## Audio catalog',
      'Sounds (3): ui-toggle, win, lose',
      '',
      'Music (1): bright-chase',
      '## Exemplar game',
      '### games/dodge-the-falling-rocks/GAME.json',
      '{"audio":{"sounds":["ui-toggle"]}}',
      '## File-shape rules',
      '- Keep files small.',
    ].join('\n');

    const compact = compactKitDigestForPrompt(full);

    expect(compact).toContain('Sounds (3): ui-toggle, win, lose');
    expect(compact).toContain('Music (1): bright-chase');
    expect(compact.indexOf('Audio catalog')).toBeLessThan(compact.indexOf('dodge-the-falling-rocks/GAME.json'));
  });
});
