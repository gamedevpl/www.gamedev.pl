import { describe, expect, it, vi } from 'vitest';
import { VertexCodeLane, codeLaneEnabled } from './code-lane.js';

/*
 * The lane's contract, tested through an injected client and builder: the model
 * proposes, the compiler decides, and nothing that fails to build ever reaches a
 * player's frame.
 */

const SOURCES = {
  'game.ts': "import './game/runtime.ts';\n",
  'game/runtime.ts': `import { CELL } from './model.ts';

/** Start the loop. */
export function startGame() {
  const speed = 0.16;
  return speed;
}
`,
};

/** A client stub: each call returns the next queued JSON payload. */
function stubClient(responses: unknown[]) {
  const prompts: string[] = [];
  const client = ((prompt: string) => {
    prompts.push(prompt);
    const payload = responses.shift();
    const chain = {
      temperature: () => chain,
      signal: () => chain,
      json: (parse: (value: unknown) => unknown) => Promise.resolve(parse(payload)),
    };
    return chain;
  }) as never;
  return { client, prompts };
}

describe('code lane', () => {
  it('picks a region, edits it, and returns overrides for the one file', async () => {
    const { client, prompts } = stubClient([
      { decision: 'edit', file: 'game/runtime.ts', name: 'startGame', summary: { en: 'Faster', pl: 'Szybciej' } },
      {
        replacement: '/** Start the loop. */\nexport function startGame() {\n  return 0.08;\n}',
        summary: { en: 'Faster', pl: 'Szybciej' },
      },
    ]);
    const lane = new VertexCodeLane({ client });
    const build = vi.fn(async () => ({ ok: true }) as const);

    const result = await lane.run({ slug: 'g', sources: SOURCES, utterance: 'make it faster' }, build);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.overrides)).toEqual(['game/runtime.ts']);
    expect(result.overrides['game/runtime.ts']).toContain('return 0.08;');
    // Untouched neighbours survive the splice.
    expect(result.overrides['game/runtime.ts']).toContain("import { CELL } from './model.ts';");
    expect(result.rounds).toBe(0);

    // The picker saw the map, not the game; the editor saw one region.
    expect(prompts[0]).toContain('game/runtime.ts:startGame');
    expect(prompts[0]).not.toContain('const speed = 0.16;');
    expect(prompts[1]).toContain('const speed = 0.16;');
    expect(prompts[1]).not.toContain("import './game/runtime.ts';");
  });

  it('repairs once from the compiler error, sending errors and not the file again', async () => {
    const { client, prompts } = stubClient([
      { decision: 'edit', file: 'game/runtime.ts', name: 'startGame' },
      { replacement: 'export function startGame() { return ; }' },
      { replacement: 'export function startGame() {\n  return 0.08;\n}' },
    ]);
    const lane = new VertexCodeLane({ client });
    let calls = 0;
    const build = async () => {
      calls += 1;
      return calls === 1 ? ({ ok: false, errors: ['runtime.ts:2: Unexpected ";"'] } as const) : ({ ok: true } as const);
    };

    const result = await lane.run({ slug: 'g', sources: SOURCES, utterance: 'faster' }, build);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rounds).toBe(1);
    expect(prompts[2]).toContain('Unexpected ";"');
    expect(prompts[2]).not.toContain('const speed = 0.16;');
  });

  it('gives up honestly after the repair cap instead of shipping a broken build', async () => {
    const { client } = stubClient([
      { decision: 'edit', file: 'game/runtime.ts', name: 'startGame' },
      { replacement: 'broken 1' },
      { replacement: 'broken 2' },
      { replacement: 'broken 3' },
    ]);
    const lane = new VertexCodeLane({ client });
    const build = async () => ({ ok: false, errors: ['nope'] }) as const;

    const result = await lane.run({ slug: 'g', sources: SOURCES, utterance: 'faster' }, build);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('did_not_compile');
  });

  it('refuses a request the picker rejects, and never calls the builder', async () => {
    const { client } = stubClient([{ decision: 'reject', summary: { en: 'No', pl: 'Nie' } }]);
    const lane = new VertexCodeLane({ client });
    const build = vi.fn(async () => ({ ok: true }) as const);

    const result = await lane.run({ slug: 'g', sources: SOURCES, utterance: 'something nasty' }, build);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('refused');
    expect(build).not.toHaveBeenCalled();
  });

  it('treats an invented region as "needs a bigger change", not as an edit', async () => {
    const { client } = stubClient([{ decision: 'edit', file: 'game/nope.ts', name: 'ghost' }]);
    const lane = new VertexCodeLane({ client });
    const build = vi.fn(async () => ({ ok: true }) as const);

    const result = await lane.run({ slug: 'g', sources: SOURCES, utterance: 'x' }, build);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('no_region');
    expect(build).not.toHaveBeenCalled();
  });

  it('is off unless the deploy flag says exactly true', () => {
    expect(codeLaneEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(codeLaneEnabled({ CODE_LANE: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});
