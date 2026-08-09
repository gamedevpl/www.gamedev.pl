import { describe, expect, it, vi } from 'vitest';
import {
  appendKitDigest,
  compactKitDigestForPrompt,
  createGcsKitDigestLoader,
  formatOmittedNote,
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

    const compact = compactKitDigestForPrompt(full, 1400);

    // Party and zone survive whole — the failure this guards against dropped them (or
    // orphaned their members) below any generous-looking budget. What didn't fit (here,
    // GameKitApi) is named in an omission note rather than vanishing without a trace.
    expect(compact).toContain('interface GameKitParty');
    expect(compact).toContain('interface GameKitZone');
    expect(compact).toContain('Omitted for length');
    expect(compact).toContain('GameKitApi');
    expect(compact.trim().endsWith('- Keep files small.')).toBe(true);
  });

  it('formatOmittedNote lists every name when it fits, and never exceeds its byte budget', () => {
    const note = formatOmittedNote(['GameKitParty', 'GameKitZone'], 600);
    expect(note).toContain('GameKitParty');
    expect(note).toContain('GameKitZone');
    expect(Buffer.byteLength(note, 'utf8')).toBeLessThanOrEqual(600);
  });

  it('formatOmittedNote truncates a long name list instead of overflowing its reserve', () => {
    // A realistic tight-budget scenario: most of a 114-declaration API omitted, and the
    // note listing them all unbounded ran to 2+ KiB with nothing reserving room for it —
    // the actual bug behind the digest silently dropping the File-shape rules section.
    const names = Array.from({ length: 100 }, (_, i) => `GameKitDeclarationNumber${i}`);
    const note = formatOmittedNote(names, 250);
    expect(Buffer.byteLength(note, 'utf8')).toBeLessThanOrEqual(250);
    expect(note).toMatch(/… and \d+ more/);
    expect(note).not.toContain('GameKitDeclarationNumber99');

    // Too tight even for the "… and N more" suffix: still bounded, just without it — a
    // truncated list beats an overflowing note either way.
    const tighter = formatOmittedNote(names, 200);
    expect(Buffer.byteLength(tighter, 'utf8')).toBeLessThanOrEqual(200);
  });

  it('formatOmittedNote returns empty for nothing omitted', () => {
    expect(formatOmittedNote([], 600)).toBe('');
  });

  it('never truncates the exemplar or File-shape rules to make room for the API, at realistic sizes', () => {
    // A large exemplar (bigger than a flat percentage of a small budget would allow) used
    // to get cut off mid-file by the final blunt byte-cap safety net, because nothing
    // measured the shell's real size before guessing how much room the API could have.
    // Reproduces that at the platform lane's real default budget.
    const bigFile = 'x'.repeat(6000);
    const full = [
      '## GameKit API surface',
      '~~~typescript',
      `interface GameKitApi { locale: string; ${'y'.repeat(30000)} }`,
      '~~~',
      '## Exemplar game',
      `### games/dodge-the-falling-rocks/GAME.json\n\n~~~text\n${bigFile}\n~~~`,
      `### games/dodge-the-falling-rocks/index.html\n\n~~~text\n${bigFile}\n~~~`,
      '## File-shape rules',
      '- Keep files small.',
    ].join('\n');

    const compact = compactKitDigestForPrompt(full); // default 20 KiB budget

    expect(compact.trim().endsWith('- Keep files small.')).toBe(true);
    expect(compact).toContain('### games/dodge-the-falling-rocks/index.html');
  });

  it('elideDeclaration keeps a multiline member whole even when its closing brace lands at the interface indent', () => {
    // Shaped after the real GameKitApi.createZone: a member whose own closing
    // `}): ReturnType;` sits at the interface's 2-space indent, same as any other member's
    // opening line. An indentation-only member split misread that closing line as a new
    // member and could drop it once the tight budget ran out, emitting createZone opened
    // but never closed — malformed output for exactly the factory this exists to preserve.
    const pad = 'x'.repeat(400);
    const api = [
      'interface GameKitApi {',
      '  createZone<S>(config: {',
      '    sim: GameKitZoneSim<S>;',
      '    onStatus?(status: string, info: { slot: number }): void;',
      '  }): GameKitZone<S>;',
      `  other(): ${pad};`,
      '}',
    ].join('\n');

    const blocks = splitDeclarationBlocks(api);
    // Budget too small for the whole interface (the padded `other` member alone forces
    // that), forcing elideDeclaration's member-wise path.
    const { kept } = selectApiBlocks(blocks, ['zone'], 250);
    const text = kept.map((block) => block.text).join('\n');

    expect(text).toContain('createZone<S>(config: {');
    expect(text).toContain('}): GameKitZone<S>;');
    // Brace/paren/bracket depth must return to zero — an unclosed opener is the bug.
    let depth = 0;
    for (const ch of text) {
      if (ch === '{' || ch === '(' || ch === '[') depth++;
      else if (ch === '}' || ch === ')' || ch === ']') depth--;
    }
    expect(depth).toBe(0);
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
