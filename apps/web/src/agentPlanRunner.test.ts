// @vitest-environment jsdom

// The runner against a stand-in game answering like the bridge.

import { beforeEach, describe, expect, it } from 'vitest';
import { parseAgentPlan } from './agentPlan.js';
import { runAgentPlan } from './agentPlanRunner.js';
import { dispatchFromFrame } from './test-utils/frameMessage.js';

type Sent = { type?: string; id?: number; command?: { kind?: string; frames?: number } };

// Answers every command as the bridge would, counting frames.
function fakeGame(options: { startsPlayingAfter?: number; score?: (frame: number) => number } = {}) {
  const sent: Sent[] = [];
  let frame = 0;
  const startsPlayingAfter = options.startsPlayingAfter ?? 0;

  const snapshotAt = (at: number) => ({
    state: at >= startsPlayingAfter ? 'playing' : 'intro',
    score: options.score ? options.score(at) : 0,
  });

  const contentWindow = {
    postMessage(message: Sent) {
      sent.push(message);
      const command = message.command ?? {};
      const id = message.id;
      if (command.kind === 'screenshot') {
        // Two replies, as the executor sends: shot, then trailing state.
        reply({ type: 'agent:shot', id, png: 'UE5H', frame });
        reply({ type: 'agent:state', id, frame, snapshot: snapshotAt(frame) });
        return;
      }
      if (command.kind === 'step' || command.kind === 'press' || command.kind === 'drag') {
        frame += command.frames ?? 1;
      } else if (command.kind === 'tap' || command.kind === 'click') {
        frame += 1;
      }
      reply({ type: 'agent:state', id, frame, snapshot: snapshotAt(frame) });
    },
  };

  function reply(data: Record<string, unknown>) {
    // Asynchronous, like a real postMessage round trip.
    setTimeout(() => {
      dispatchFromFrame(contentWindow, { source: 'gdpl-player', ...data });
    }, 0);
  }

  return { frame: { contentWindow } as unknown as HTMLIFrameElement, sent, frames: () => frame };
}

const plan = (body: Record<string, unknown>) => parseAgentPlan(JSON.stringify(body));

beforeEach(() => {
  // Each test listens for its own replies; nothing persists between them.
});

describe('runAgentPlan', () => {
  it('runs every action and reports what the game did', async () => {
    const game = fakeGame({ score: (frame) => frame });
    const result = await runAgentPlan(
      game.frame,
      plan({ fps: 30, maxFrames: 300, script: [{ tap: 'Enter' }, { press: { key: 'ArrowRight', frames: 20 } }] }),
    );

    expect(result.outcome).toBe('completed');
    expect(result.frames).toBeGreaterThanOrEqual(21);
    expect(result.trace.map((entry) => entry.action)).toEqual(['tap', 'press ArrowRight 20']);
    expect(result.finalSnapshot.state).toBe('playing');
  });

  it('waits for a condition by stepping, and records that it came true', async () => {
    const game = fakeGame({ startsPlayingAfter: 40 });
    const result = await runAgentPlan(
      game.frame,
      plan({
        fps: 30,
        maxFrames: 300,
        script: [{ waitFor: { field: 'state', equals: 'playing', maxFrames: 120 } }],
      }),
    );

    expect(result.outcome).toBe('completed');
    const check = result.checks.find((entry) => entry.kind === 'waitFor');
    expect(check?.passed).toBe(true);
    expect(check?.frame).toBeGreaterThanOrEqual(40);
  });

  it('stops at a failed assert and says which one', async () => {
    const game = fakeGame();
    const result = await runAgentPlan(
      game.frame,
      plan({ fps: 30, maxFrames: 60, script: [{ assert: { field: 'score', greaterThan: 5 } }, { wait: 5 }] }),
    );

    expect(result.outcome).toBe('failed');
    expect(result.note).toContain('score greaterThan 5');
    // The action after the failure never ran.
    expect(result.trace).toHaveLength(1);
  });

  it('reports a waitFor that never came true, which is a finding and not an error', async () => {
    const game = fakeGame({ startsPlayingAfter: 10_000 });
    const result = await runAgentPlan(
      game.frame,
      plan({ fps: 30, maxFrames: 120, script: [{ waitFor: { field: 'state', equals: 'playing', maxFrames: 30 } }] }),
    );

    expect(result.outcome).toBe('failed');
    expect(result.note).toContain('never came true');
    expect(result.checks[0]?.passed).toBe(false);
  });

  it('stops when the plan has spent its frame budget', async () => {
    const game = fakeGame();
    const result = await runAgentPlan(
      game.frame,
      plan({
        fps: 30,
        maxFrames: 30,
        script: [{ repeat: { times: 10, actions: [{ press: { key: 'ArrowRight', frames: 20 } }] } }],
      }),
    );

    expect(result.outcome).toBe('exhausted');
    expect(result.note).toContain('30 frames');
  });

  it('captures the frames the plan asked for, by name', async () => {
    const game = fakeGame();
    const result = await runAgentPlan(
      game.frame,
      plan({ fps: 30, maxFrames: 60, script: [{ capture: 'start' }, { wait: 5 }, { capture: 'after' }] }),
    );

    expect(result.captures.map((shot) => shot.name)).toEqual(['start', 'after']);
    expect(result.captures.every((shot) => shot.png === 'UE5H')).toBe(true);
  });

  it('takes its own filmstrip when the plan declares no capture', async () => {
    const game = fakeGame();
    const result = await runAgentPlan(
      game.frame,
      plan({ fps: 30, maxFrames: 120, script: [{ wait: 5 }, { wait: 5 }, { wait: 5 }, { wait: 5 }] }),
    );

    // Games that describe nothing in text are seen this way.
    expect(result.captures.length).toBeGreaterThan(0);
    expect(result.captures.at(-1)?.name).toBe('final');
  });

  it("does not mistake a screenshot's trailing state for the next command's reply", async () => {
    const game = fakeGame();
    const result = await runAgentPlan(
      game.frame,
      plan({ fps: 30, maxFrames: 120, script: [{ capture: 'start' }, { wait: 7 }] }),
    );

    // Without ids the wait read the shot's state: frame 0.
    const wait = result.trace.find((entry) => entry.action === 'wait 7');
    expect(wait?.frame).toBe(7);
    expect(result.outcome).toBe('completed');
  });

  it('clamps an action to the frames the plan has left', async () => {
    const game = fakeGame();
    const result = await runAgentPlan(game.frame, plan({ fps: 30, maxFrames: 10, script: [{ wait: 100 }] }));

    // An oversized action used to run in full and report completion.
    expect(result.outcome).toBe('exhausted');
    expect(result.frames).toBeLessThanOrEqual(10);
    expect(game.frames()).toBeLessThanOrEqual(10);
  });

  it('gives up rather than hanging when the frame stops answering', async () => {
    const dead = { contentWindow: { postMessage: () => undefined } } as unknown as HTMLIFrameElement;
    await expect(runAgentPlan(dead, plan({ script: [{ wait: 1 }] }), { timeoutMs: 50 })).rejects.toThrow(
      /did not answer/,
    );
  });
});
