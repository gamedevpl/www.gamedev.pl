import { describe, expect, it } from 'vitest';
import { channelControlFields } from './mcp-tool-support.js';
import { nextSuggestedTool } from './mcp-round-guide.js';
import { winProofProblem } from './win-proof-hint.js';

const files = (acceptance: unknown, capture?: unknown) => [
  { path: 'ACCEPTANCE.json', content: JSON.stringify(acceptance) },
  ...(capture ? [{ path: 'CAPTURE.json', content: JSON.stringify(capture) }] : []),
];
const plan = (script: unknown[]) => ({ seed: 1, fps: 30, maxFrames: 900, script });

describe('winProofProblem', () => {
  it('objects to an objective that is the loss', () => {
    const acceptance = { objective: 'Lose or win', achieved: [{ field: 'state', equals: 'lost' }] };
    const capture = plan([{ waitFor: { field: 'state', equals: 'lost', maxFrames: 900 } }, { capture: 'lost' }]);
    for (const firstDelivery of [true, false]) {
      expect(winProofProblem(files(acceptance, capture), { firstDelivery })).toContain('names a loss');
    }
  });

  it('objects when a first capture never looks at the win field', () => {
    const acceptance = { objective: 'Win', achieved: [{ field: 'state', equals: 'won' }] };
    const capture = plan([{ assert: { field: 'shots', greaterThanOrEqual: 1 } }, { capture: 'play' }]);
    expect(winProofProblem(files(acceptance, capture), { firstDelivery: true })).toContain('"state"');
    expect(winProofProblem(files(acceptance, capture), { firstDelivery: false })).toBeNull();
  });

  it('accepts a capture that reaches the win, also inside a repeat', () => {
    const acceptance = { objective: 'Win', achieved: [{ field: 'state', equals: 'won' }] };
    const direct = plan([{ waitFor: { field: 'state', equals: 'won', maxFrames: 600 } }]);
    const nested = plan([{ repeat: { times: 3, actions: [{ assert: { field: 'state', equals: 'won' } }] } }]);
    expect(winProofProblem(files(acceptance, direct), { firstDelivery: true })).toBeNull();
    expect(winProofProblem(files(acceptance, nested), { firstDelivery: true })).toBeNull();
  });

  it('does not take a loss on the same field for the win', () => {
    const acceptance = { objective: 'Win', achieved: [{ field: 'state', equals: 'won' }] };
    const lossOnly = plan([{ waitFor: { field: 'state', equals: 'lost', maxFrames: 900 } }]);
    expect(winProofProblem(files(acceptance, lossOnly), { firstDelivery: true })).toContain('"state"');
    // Not every replay runner enforces repeat.until yet.
    const until = plan([{ repeat: { times: 9, until: { field: 'state', equals: 'won' }, actions: [{ wait: 5 }] } }]);
    expect(winProofProblem(files(acceptance, until), { firstDelivery: true })).toContain('"state"');
  });

  it('takes a oneOf whose every member meets the objective', () => {
    const acceptance = { objective: 'Win', achieved: [{ field: 'state', equals: 'won' }] };
    const only = plan([{ waitFor: { field: 'state', oneOf: ['won'], maxFrames: 600 } }]);
    const either = plan([{ waitFor: { field: 'state', oneOf: ['won', 'lost'], maxFrames: 600 } }]);
    expect(winProofProblem(files(acceptance, only), { firstDelivery: true })).toBeNull();
    expect(winProofProblem(files(acceptance, either), { firstDelivery: true })).toContain('"state"');
  });

  it('reads numeric objectives by their bounds', () => {
    const acceptance = { objective: 'Score ten', achieved: [{ field: 'score', atLeast: 10 }] };
    const short = plan([{ assert: { field: 'score', greaterThanOrEqual: 3 } }]);
    const enough = plan([{ assert: { field: 'score', greaterThanOrEqual: 12 } }]);
    expect(winProofProblem(files(acceptance, short), { firstDelivery: true })).toContain('"score"');
    expect(winProofProblem(files(acceptance, enough), { firstDelivery: true })).toBeNull();
  });

  it('names a capture step the runner cannot finish, on any delivery', () => {
    const acceptance = { objective: 'Deliver', achieved: [{ field: 'delivered', atLeast: 1 }] };
    const win = { waitFor: { field: 'delivered', greaterThanOrEqual: 1, maxFrames: 900 } };
    const noOperator = plan([{ repeat: { times: 2, actions: [{ assert: { field: 'lives', atLeast: 1 } }] } }, win]);
    for (const firstDelivery of [true, false]) {
      const problem = winProofProblem(files(acceptance, noOperator), { firstDelivery });
      expect(problem).toContain('assert needs exactly one comparison operator');
      expect(problem).toContain('greaterThanOrEqual');
      expect(problem).not.toContain('locally');
    }
    expect(winProofProblem(files({}, noOperator), { firstDelivery: false })).toContain('comparison operator');
    // The publish gate refuses two operators on one condition.
    const twoOperators = plan([{ assert: { field: 'lives', equals: 1, notEquals: 0 } }, win]);
    expect(winProofProblem(files(acceptance, twoOperators), { firstDelivery: true })).toContain('exactly one');
    const until = plan([{ repeat: { times: 5, until: { field: 'delivered', atLeast: 1 }, actions: [] } }, win]);
    expect(winProofProblem(files(acceptance, until), { firstDelivery: true })).toContain('repeat.until needs exactly');
  });

  it('holds a plan that is not valid JSON or has no script', () => {
    const acceptance = { path: 'ACCEPTANCE.json', content: '{"achieved":[{"field":"state","equals":"won"}]}' };
    for (const content of ['{', '{}']) {
      const problem = winProofProblem([acceptance, { path: 'CAPTURE.json', content }], { firstDelivery: true });
      expect(problem).toMatch(/not valid JSON|not a capture plan/);
    }
  });

  it('holds a first delivery that has an objective but no capture plan', () => {
    const acceptance = { objective: 'Win', achieved: [{ field: 'state', equals: 'won' }] };
    expect(winProofProblem(files(acceptance), { firstDelivery: true })).toContain('has no CAPTURE.json');
    expect(winProofProblem(files(acceptance), { firstDelivery: false })).toBeNull();
  });

  it('stays silent when it cannot tell', () => {
    expect(winProofProblem([], { firstDelivery: true })).toBeNull();
    expect(winProofProblem([{ path: 'ACCEPTANCE.json', content: '{' }], { firstDelivery: true })).toBeNull();
    expect(winProofProblem(files({ objective: 'x', achieved: [] }), { firstDelivery: true })).toBeNull();
    const numeric = { objective: 'Score', achieved: [{ field: 'score', atLeast: 10 }] };
    // A later delivery may carry only changed files.
    expect(winProofProblem(files(numeric), { firstDelivery: false })).toBeNull();
  });
});

describe('no_win', () => {
  it('rides the submit reply as a soft warning and holds back the close', () => {
    const warned = channelControlFields({ winUnproven: 'ACCEPTANCE.json names a loss' }, [
      { code: 'call_end', message: 'Delivered.' },
    ]);
    expect(warned.warnings?.map((warning) => warning.code)).toEqual(['call_end', 'no_win']);
    expect(warned.stop).toBe(false);
    expect(nextSuggestedTool({ tool: 'submit_sources', warnings: warned.warnings ?? [] })).toBeUndefined();
    expect(channelControlFields({}).warnings).toBeUndefined();
  });
});
