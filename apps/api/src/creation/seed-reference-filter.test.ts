import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenAIClient, GenerationResult } from 'genaicode';
import { buildSeedContext } from './seed-context.js';
import {
  buildReferenceFilterPrompt,
  createReferenceFilter,
  referenceCandidates,
  renderFilteredReferences,
  REFERENCE_FILTER_TIMEOUT_MS,
} from './seed-reference-filter.js';

const files: Record<string, string> = {
  'games/strategy/GAME.json': '{"engine":{"modules":["input","gameplay"]}}',
  'games/strategy/game/controls.ts':
    "import { Squad } from './model.js'; export function selectSquad(s: Squad) { return 'Żołnierz 🪖 ORIGINAL_BODY'; }",
  'games/strategy/game/model.ts': "import type { Order } from './orders.ts'; export interface Squad { order: Order }",
  'games/strategy/game/orders.ts': "import type { Squad } from './model.ts'; export type Order = 'move';",
  'games/strategy/game/unrelated.ts': "export function cosmetics() { return 'UNRELATED_BODY'; }",
  'games/other/game/secrets.ts': 'export const other = true;',
};

function context(extra: Record<string, string> = {}) {
  const all = { ...files, ...extra };
  return buildSeedContext({ paths: Object.keys(all), read: (p) => all[p] ?? null }, [
    { slug: 'strategy', title: 'Strategy', genre: 'RTS' },
    { slug: 'other', title: 'Other', genre: 'puzzle' },
    { slug: 'archived', title: 'Archived', genre: 'RTS', status: 'archived' },
  ])!;
}

function client(
  response: string,
  hooks: {
    prompt?: (p: string) => void;
    signal?: (s: AbortSignal) => void;
    run?: () => Promise<GenerationResult>;
  } = {},
) {
  return ((prompt: string) => {
    hooks.prompt?.(prompt);
    const builder = {
      thinking: () => builder,
      maxOutputTokens: () => builder,
      responseFormat: () => builder,
      signal: (signal: AbortSignal) => {
        hooks.signal?.(signal);
        return builder;
      },
      run:
        hooks.run ??
        (async () => ({
          parts: [{ type: 'text', text: response }],
          model: 'gemini-3.5-flash-lite',
          usage: { inputTokens: 100, outputTokens: 20 },
          raw: { usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 } },
        })),
    };
    return builder;
  }) as unknown as GenAIClient;
}

afterEach(() => vi.useRealTimers());

describe('seed reference file selection', () => {
  it('offers only picked published games and names/imports instead of source bodies', () => {
    const ctx = context({ 'games/archived/game/runtime.ts': 'export const retired = true;' });
    const candidates = referenceCandidates(ctx, ['strategy', 'archived', 'missing']);
    const { prompt } = buildReferenceFilterPrompt(candidates, 'Select infantry and move them.');
    expect(prompt).toContain('selectSquad');
    expect(prompt).toContain('./model.js');
    expect(prompt).not.toContain('ORIGINAL_BODY');
    expect(prompt).not.toContain('UNRELATED_BODY');
    expect(prompt).not.toContain('games/other/');
    expect(prompt).not.toContain('games/archived/');
  });

  it('keeps original code, adds manifest and transitive cyclic imports, and omits unrelated files', () => {
    const candidates = referenceCandidates(context(), ['strategy']);
    const root = candidates.find((f) => f.path.endsWith('/controls.ts'))!;
    const result = renderFilteredReferences(candidates, [root.id, root.id], 80000);
    expect(result.references).toContain(files[root.path]);
    expect(result.references).toContain(files['games/strategy/GAME.json']);
    expect(result.references).toContain(files['games/strategy/game/model.ts']);
    expect(result.references).toContain(files['games/strategy/game/orders.ts']);
    expect(result.references).not.toContain('UNRELATED_BODY');
    expect(result.selectedFiles).toBe(4);
  });

  it('bounds large metadata catalogs without letting the first game hide the other picks', () => {
    const extra = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [
        `games/strategy/game/large-${i}.ts`,
        Array.from({ length: 16 }, (_, n) => `export const ${'symbol'.repeat(12)}${n} = 1;`).join('\n'),
      ]),
    );
    const candidates = referenceCandidates(context(extra), ['strategy', 'other']);
    const result = buildReferenceFilterPrompt(candidates, '🪖'.repeat(4000));
    expect(Buffer.byteLength(result.prompt)).toBeLessThanOrEqual(32000);
    expect(result.offered.length).toBeLessThan(candidates.length);
    expect(result.offered.some((file) => file.path.startsWith('games/other/'))).toBe(true);
  });

  it('does not spend on a selector when no picked game has source candidates', async () => {
    const invoked = vi.fn();
    const filter = createReferenceFilter({ client: client('', { prompt: invoked }) });
    await expect(filter({ context: context(), picks: ['missing'], spec: 'RTS', byteBudget: 80000 })).rejects.toThrow(
      'no source candidates',
    );
    expect(invoked).not.toHaveBeenCalled();
  });

  it('counts UTF-8 bytes and headers, never slices code or packs half a dependency group', () => {
    const candidates = referenceCandidates(context(), ['strategy']);
    const root = candidates.find((f) => f.path.endsWith('/controls.ts'))!;
    const full = renderFilteredReferences(candidates, [root.id], 80000);
    const exact = Buffer.byteLength(full.references);
    expect(renderFilteredReferences(candidates, [root.id], exact).references).toBe(full.references);
    expect(() => renderFilteredReferences(candidates, [root.id], exact - 1)).toThrow('did not fit');
    expect(() => renderFilteredReferences(candidates, [99999], 80000)).toThrow('unknown file ID');
  });

  it('records the paid selector separately, including reasoning, before rejecting invalid output', async () => {
    const onUsage = vi.fn(async () => undefined);
    const filter = createReferenceFilter({ client: client('{"files":[99999]}') });
    await expect(
      filter({ context: context(), picks: ['strategy'], spec: 'RTS', byteBudget: 80000, onUsage }),
    ).rejects.toThrow('unoffered');
    expect(onUsage).toHaveBeenCalledWith({
      model: 'gemini-3.5-flash-lite',
      provider: 'vertex',
      inputTokens: 100,
      outputTokens: 50,
    });
  });

  it('does not accept selector-authored paths or rewritten code', async () => {
    const filter = createReferenceFilter({ client: client('{"files":["../../other/game/secrets.ts"]}') });
    await expect(filter({ context: context(), picks: ['strategy'], spec: 'RTS', byteBudget: 80000 })).rejects.toThrow();
  });

  it('expires even when the model transport ignores cancellation', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const filter = createReferenceFilter({
      client: client('', {
        signal: (s) => {
          signal = s;
        },
        run: () => new Promise(() => undefined),
      }),
    });
    const pending = filter({ context: context(), picks: ['strategy'], spec: 'RTS', byteBudget: 80000 });
    const rejected = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(REFERENCE_FILTER_TIMEOUT_MS + 1);
    await rejected;
    expect(signal?.aborted).toBe(true);
  });
});
