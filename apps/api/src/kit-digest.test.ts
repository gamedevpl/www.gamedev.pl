import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_MCP_DIGEST_MAX_BYTES,
  appendKitDigest,
  compactKitDigestForApi,
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
    // party used to be an unnamed orphan line; now it survives whole.
    expect(compact).toContain('interface GameKitParty { down(slot: number): boolean; }');
    expect(compact).toContain('game/runtime.ts');
    expect(compact).toContain('Keep files small.');
    // Fixture is under budget, so nothing is dropped here (see below).
    expect(compact).toContain('interface Unrelated');
  });

  it('names what a tight budget omits instead of silently dropping it', () => {
    // Sized like the real declaration file, to force a genuine omission.
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

    // Party/zone survive whole; what didn't fit is named, not vanished.
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
    // An unbounded note list once ran past 2 KiB, unreserved.
    const names = Array.from({ length: 100 }, (_, i) => `GameKitDeclarationNumber${i}`);
    const note = formatOmittedNote(names, 250);
    expect(Buffer.byteLength(note, 'utf8')).toBeLessThanOrEqual(250);
    expect(note).toMatch(/… and \d+ more/);
    expect(note).not.toContain('GameKitDeclarationNumber99');

    // Too tight even for the suffix — still bounded, just without it.
    const tighter = formatOmittedNote(names, 200);
    expect(Buffer.byteLength(tighter, 'utf8')).toBeLessThanOrEqual(200);
  });

  it('formatOmittedNote returns empty for nothing omitted', () => {
    expect(formatOmittedNote([], 600)).toBe('');
  });

  it('never truncates the exemplar or File-shape rules to make room for the API, at realistic sizes', () => {
    // A big exemplar used to get truncated by an unmeasured budget.
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

  it('caps get_kit_api output well under a single MCP tool-result limit at realistic kit scale', () => {
    // Real production incident — see SKILL.md "not free".
    const declarations = Array.from({ length: 120 }, (_, i) => {
      const pad = 'x'.repeat(600);
      return `interface GameKitDeclaration${i} {\n  method${i}(arg: string): void; // ${pad}\n}`;
    });
    const api = declarations.join('\n');
    const full = [
      '## GameKit API surface',
      '~~~typescript',
      api,
      '~~~',
      '## Audio catalog',
      '',
      'Sounds (2): win, lose',
      '',
      'Music (1): bright-chase',
      '## Exemplar game',
      '### games/dodge-the-falling-rocks/game.ts',
      'export {};',
      '## File-shape rules',
      '- Keep files small.',
    ].join('\n');
    expect(Buffer.byteLength(api, 'utf8')).toBeGreaterThan(70_000); // realistic scale

    const digest = compactKitDigestForApi(full); // DEFAULT_MCP_DIGEST_MAX_BYTES
    const mcpResponseShape = JSON.stringify({
      engineRef: 'a'.repeat(40),
      digest,
      pendingMessages: [],
      stop: false,
      warnings: [],
    });

    // Byte proxy for a ~25k token ceiling; see SKILL.md.
    expect(Buffer.byteLength(mcpResponseShape, 'utf8')).toBeLessThan(65_000);
    expect(DEFAULT_MCP_DIGEST_MAX_BYTES).toBeLessThanOrEqual(60_000);
  });

  it('elideDeclaration keeps a multiline member whole even when its closing brace lands at the interface indent', () => {
    // Shaped after createZone: its closing brace shares the opener's indent.
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
    // Too small for the whole interface, forcing elideDeclaration's path.
    const { kept } = selectApiBlocks(blocks, ['zone'], 250);
    const text = kept.map((block) => block.text).join('\n');

    expect(text).toContain('createZone<S>(config: {');
    expect(text).toContain('}): GameKitZone<S>;');
    // Depth must return to zero — an unclosed opener is the bug.
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

    // Guards against source order starving zone of its one block.
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
