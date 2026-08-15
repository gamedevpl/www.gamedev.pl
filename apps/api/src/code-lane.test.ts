import { describe, expect, it, vi } from 'vitest';
import { VertexCodeLane, codeLaneEnabled, parseLaneJson } from './code-lane.js';

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

/**
 * A client stub: each call returns the next queued JSON payload as a real
 * `GenerationResult`, because the lane reads `usage` off it — a stub that only
 * answered `.json()` would let the token accounting rot unnoticed.
 */
function stubClient(responses: unknown[], usage = { inputTokens: 100, outputTokens: 20 }) {
  const prompts: string[] = [];
  const client = ((prompt: string) => {
    prompts.push(prompt);
    const payload = responses.shift();
    const chain = {
      thinking: () => chain,
      temperature: () => chain,
      signal: () => chain,
      run: () => Promise.resolve({ parts: [{ type: 'text', text: JSON.stringify(payload) }], usage }),
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

  it('repairs once, re-sending the region and the rejected attempt with the errors', async () => {
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
    // The region, again. The old prompt sent the errors alone and asserted the
    // region's *absence* here — encoding as a requirement the very bug that had
    // repair rounds answering with code from an unrelated game, because these
    // calls carry no history and the model had never seen what it was fixing.
    expect(prompts[2]).toContain('const speed = 0.16;');
    // And the attempt being corrected, so "fix this" has a `this`.
    expect(prompts[2]).toContain('export function startGame() { return ; }');
  });

  it('tells the player what they asked for, not how the lane fixed itself', async () => {
    // Seen in production: a player asked for a yellow car and was told "Fixed
    // type error in startGame by removing invalid property reference on
    // RaceScene3D and passing required setup parameter." That is a note to a
    // compiler wearing the costume of an answer — the repair round's summary had
    // overwritten the edit's. The repair preserves the intent of the edit it
    // repairs, so the first description is the true one.
    const { client } = stubClient([
      { decision: 'edit', file: 'game/runtime.ts', name: 'startGame' },
      {
        replacement: 'export function startGame() { return ; }',
        summary: { en: 'Made the car yellow.', pl: 'Samochód jest teraz żółty.' },
      },
      {
        replacement: 'export function startGame() {\n  return 0.08;\n}',
        summary: { en: 'Fixed type error by removing an invalid property reference.', pl: 'Naprawiono błąd typu.' },
      },
    ]);
    const lane = new VertexCodeLane({ client });
    let calls = 0;
    const build = async () => {
      calls += 1;
      return calls === 1 ? ({ ok: false, errors: ['runtime.ts:2: Unexpected ";"'] } as const) : ({ ok: true } as const);
    };

    const result = await lane.run({ slug: 'g', sources: SOURCES, utterance: 'make my car yellow' }, build);
    expect(result.ok).toBe(true);
    expect(result.summary?.en).toBe('Made the car yellow.');
    expect(result.summary?.pl).toBe('Samochód jest teraz żółty.');
  });

  it('takes a later summary when the first was half-written, rather than none at all', async () => {
    // `EditSchema` permits `en` without `pl`, and a summary missing a language is
    // unusable. Treating that as "already described" would let one malformed
    // reply cost the player any answer — while a *usable* first summary must
    // still refuse to be overwritten by a repair note.
    const { client } = stubClient([
      { decision: 'edit', file: 'game/runtime.ts', name: 'startGame' },
      { replacement: 'export function startGame() { return ; }', summary: { en: 'Only English.' } },
      {
        replacement: 'export function startGame() {\n  return 0.08;\n}',
        summary: { en: 'Made the car yellow.', pl: 'Samochód jest teraz żółty.' },
      },
    ]);
    const lane = new VertexCodeLane({ client });
    let calls = 0;
    const build = async () => {
      calls += 1;
      return calls === 1 ? ({ ok: false, errors: ['runtime.ts:2: Unexpected ";"'] } as const) : ({ ok: true } as const);
    };

    const result = await lane.run({ slug: 'g', sources: SOURCES, utterance: 'make my car yellow' }, build);
    expect(result.ok).toBe(true);
    expect(result.summary?.en).toBe('Made the car yellow.');
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

  it('banks the usage of every call it makes', async () => {
    // The cost of the two-call shape is the entire argument for it, so an
    // outcome that reports zero tokens is not a neutral omission — it is the
    // number the design is judged on, missing. It was missing: `.json()`
    // discards the result that carries `usage`.
    const { client } = stubClient([
      { decision: 'edit', file: 'game/runtime.ts', name: 'startGame' },
      { replacement: 'export function startGame() {\n  return 0.08;\n}' },
    ]);
    const lane = new VertexCodeLane({ client });

    const result = await lane.run({ slug: 'g', sources: SOURCES, utterance: 'faster' }, async () => ({ ok: true }));
    expect(result.tokens).toEqual({ input: 200, output: 40 });
  });

  it("shows the editing call the game's other types, so it cannot invent a field", async () => {
    // The default. Five of eighteen bench edits compiled and then failed the
    // player by writing to a field the type never declared; this is what stops
    // that, and it must carry declarations without carrying bodies.
    const sources = {
      'game/model.ts':
        'export type Round = {\n  seedsLeft: number;\n};\n\nexport function createRound(): Round {\n  return { seedsLeft: 3 };\n}\n',
      'game/render.ts':
        '/** Paint it. */\nexport function paintWorld(round: Round) {\n  const x = round.seedsLeft;\n  return x;\n}\n',
    };
    const { client, prompts } = stubClient([
      { decision: 'edit', file: 'game/render.ts', name: 'paintWorld' },
      { replacement: 'export function paintWorld(round: Round) {\n  return 1;\n}' },
    ]);
    await new VertexCodeLane({ client }).run({ slug: 'g', sources, utterance: 'x' }, async () => ({ ok: true }));

    // The type it must satisfy, in full.
    expect(prompts[1]).toContain('seedsLeft: number;');
    // Its neighbours by signature only — no bodies, or this stops being cheap.
    expect(prompts[1]).toContain('export function createRound(): Round');
    expect(prompts[1]).not.toContain('return { seedsLeft: 3 };');
  });

  it("never sends the editing call another region's body, but will send the file when asked", async () => {
    const pick = { decision: 'edit', file: 'game/runtime.ts', name: 'startGame' };
    const edit = { replacement: 'export function startGame() {\n  return 0.08;\n}' };
    const build = async () => ({ ok: true }) as const;

    const narrow = stubClient([pick, edit]);
    await new VertexCodeLane({ client: narrow.client }).run({ slug: 'g', sources: SOURCES, utterance: 'x' }, build);
    expect(narrow.prompts[1]).not.toContain("import { CELL } from './model.ts';");

    const wide = stubClient([pick, edit]);
    await new VertexCodeLane({ client: wide.client, editContext: 'file' }).run(
      { slug: 'g', sources: SOURCES, utterance: 'x' },
      build,
    );
    expect(wide.prompts[1]).toContain("import { CELL } from './model.ts';");
  });

  it('reads a reply that a model ended with a stray code fence', () => {
    // Observed on the bench, and the single largest cause of failure there: a
    // well-formed object followed by a closing fence that was never opened. A
    // start-anchored fence stripper cannot see it.
    expect(parseLaneJson('{"replacement":"x"}```')).toEqual({ replacement: 'x' });
    expect(parseLaneJson('```json\n{"replacement":"x"}\n```')).toEqual({ replacement: 'x' });
    expect(parseLaneJson('  {"replacement":"x"}  ')).toEqual({ replacement: 'x' });
  });

  it('reads a reply with a raw newline left inside a string', () => {
    expect(parseLaneJson('{"replacement":"line one\nline two"}')).toEqual({ replacement: 'line one\nline two' });
  });

  it('still refuses a reply that is not JSON at all', () => {
    expect(() => parseLaneJson('I cannot help with that.')).toThrow();
  });

  it('spends a repair round on an unreadable reply instead of giving up', async () => {
    // The repair budget existed but a malformed reply never reached it: the
    // edit call's catch returned straight to the player.
    const { client } = stubClient([
      { decision: 'edit', file: 'game/runtime.ts', name: 'startGame' },
      'not json at all',
      { replacement: 'export function startGame() {\n  return 0.08;\n}' },
    ]);
    const lane = new VertexCodeLane({ client });

    const result = await lane.run({ slug: 'g', sources: SOURCES, utterance: 'faster' }, async () => ({ ok: true }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rounds).toBe(1);
  });

  it('is off unless the deploy flag says exactly true', () => {
    expect(codeLaneEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(codeLaneEnabled({ CODE_LANE: 'true' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it('puts prior remix turns into the pick and edit prompts', async () => {
    const { client, prompts } = stubClient([
      { decision: 'edit', file: 'game/runtime.ts', name: 'startGame' },
      { replacement: 'export function startGame() {\n  return 0.08;\n}' },
    ]);
    await new VertexCodeLane({ client }).run(
      {
        slug: 'g',
        sources: SOURCES,
        utterance: 'again',
        history: [{ utterance: 'make it faster', summary: 'Raised the pace.' }],
      },
      async () => ({ ok: true }),
    );
    expect(prompts[0]).toContain('make it faster');
    expect(prompts[0]).toContain('Raised the pace.');
    expect(prompts[1]).toContain('make it faster');
    expect(prompts[1]).toContain("The player's request");
  });
});
