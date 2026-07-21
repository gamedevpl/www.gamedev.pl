import type { GameProject } from '@gamedevpl/game-generator';
import { describe, expect, it } from 'vitest';
import { Orchestrator, QueueFullError } from './orchestrator.js';
import type { JobRunner } from './types.js';

const project = (title = 'Game'): GameProject => ({
  title,
  description: 'd',
  html: '<canvas></canvas>',
  js: 'const a = 1;',
  css: 'body{}',
});

/** A runner whose jobs only settle when the test says so. */
function controllableRunner() {
  const gates: Array<{ resolve: (p: GameProject) => void; reject: (e: Error) => void }> = [];
  let started = 0;

  const runner: JobRunner = (_job, context) => {
    started += 1;
    context.onRunning();
    return new Promise<GameProject>((resolve, reject) => {
      gates.push({ resolve, reject });
    });
  };

  return {
    runner,
    get started() {
      return started;
    },
    resolveAll() {
      const pending = gates.splice(0);
      for (const gate of pending) gate.resolve(project());
    },
    resolveNext() {
      gates.shift()?.resolve(project());
    },
  };
}

// Lets the event loop drain microtasks so dispatched jobs settle.
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Resolves gated jobs repeatedly until the queue is idle. Freeing capacity starts
 * the next batch, so a single resolveAll() is never enough to finish a backlog.
 */
async function settleAll(gate: { resolveAll: () => void }, orchestrator: Orchestrator, maxRounds = 20): Promise<void> {
  for (let round = 0; round < maxRounds; round += 1) {
    const { queued, running, provisioning } = orchestrator.stats();
    if (queued === 0 && running === 0 && provisioning === 0) break;
    gate.resolveAll();
    await tick();
  }
  await orchestrator.drain();
}

describe('Orchestrator', () => {
  it('runs a job through its full lifecycle to succeeded', async () => {
    const orchestrator = new Orchestrator({ runner: async () => project('Done') });

    const job = orchestrator.submit({ creatorId: 'c1', prompt: 'a game' });
    expect(job.state).toBe('provisioning');

    await orchestrator.drain();

    const settled = orchestrator.get(job.id);
    expect(settled?.state).toBe('succeeded');
    expect(settled?.result?.title).toBe('Done');
    expect(settled?.startedAt).toBeDefined();
    expect(settled?.finishedAt).toBeDefined();
  });

  it('records a failure as terminal without retrying', async () => {
    let calls = 0;
    const runner: JobRunner = async () => {
      calls += 1;
      throw new Error('agent exploded');
    };
    const orchestrator = new Orchestrator({ runner });

    const job = orchestrator.submit({ creatorId: 'c1', prompt: 'a game' });
    await orchestrator.drain();

    const settled = orchestrator.get(job.id);
    expect(settled?.state).toBe('failed');
    expect(settled?.error).toBe('agent exploded');
    expect(calls).toBe(1);
  });

  it('reports running once the runner signals provisioning is done', async () => {
    const gate = controllableRunner();
    const orchestrator = new Orchestrator({ runner: gate.runner });

    const job = orchestrator.submit({ creatorId: 'c1', prompt: 'a game' });
    expect(orchestrator.get(job.id)?.state).toBe('running');

    gate.resolveAll();
    await orchestrator.drain();
    expect(orchestrator.get(job.id)?.state).toBe('succeeded');
  });

  it('never exceeds the global concurrency cap', async () => {
    const gate = controllableRunner();
    const orchestrator = new Orchestrator({ runner: gate.runner, maxConcurrent: 2, maxConcurrentPerCreator: 5 });

    for (let i = 0; i < 5; i += 1) {
      orchestrator.submit({ creatorId: 'c1', prompt: `game ${i}` });
    }

    expect(gate.started).toBe(2);
    expect(orchestrator.stats().queued).toBe(3);

    // Freeing both slots admits exactly two more — never more than the cap.
    gate.resolveAll();
    await tick();
    expect(gate.started).toBe(4);

    await settleAll(gate, orchestrator);
    expect(orchestrator.stats().succeeded).toBe(5);
  });

  it('throttles per creator so one creator cannot monopolize capacity', async () => {
    const gate = controllableRunner();
    const orchestrator = new Orchestrator({ runner: gate.runner, maxConcurrent: 3, maxConcurrentPerCreator: 1 });

    // A greedy creator submits first, but may only hold one slot.
    orchestrator.submit({ creatorId: 'greedy', prompt: 'g1' });
    orchestrator.submit({ creatorId: 'greedy', prompt: 'g2' });
    orchestrator.submit({ creatorId: 'greedy', prompt: 'g3' });
    orchestrator.submit({ creatorId: 'other', prompt: 'o1' });

    // Two started: one greedy job plus the other creator's, which was NOT
    // head-of-line blocked behind the greedy backlog.
    expect(gate.started).toBe(2);
    expect(orchestrator.stats().running).toBe(2);
    // A slot stays free rather than going to a second greedy job.
    expect(orchestrator.stats().queued).toBe(2);

    await settleAll(gate, orchestrator);
    expect(orchestrator.stats().succeeded).toBe(4);
  });

  it('applies backpressure once the queue is full', () => {
    const gate = controllableRunner();
    const orchestrator = new Orchestrator({
      runner: gate.runner,
      maxConcurrent: 1,
      maxConcurrentPerCreator: 1,
      maxQueueDepth: 2,
    });

    orchestrator.submit({ creatorId: 'c1', prompt: 'runs' });
    orchestrator.submit({ creatorId: 'c1', prompt: 'queued 1' });
    orchestrator.submit({ creatorId: 'c1', prompt: 'queued 2' });

    expect(() => orchestrator.submit({ creatorId: 'c1', prompt: 'rejected' })).toThrow(QueueFullError);
  });

  it('keeps an unknown job id undefined', () => {
    const orchestrator = new Orchestrator({ runner: async () => project() });
    expect(orchestrator.get('nope')).toBeUndefined();
  });

  it('drops the oldest finished jobs so memory stays bounded', async () => {
    const orchestrator = new Orchestrator({
      runner: async () => project(),
      maxConcurrent: 1,
      maxConcurrentPerCreator: 1,
      maxRetainedJobs: 3,
    });

    const ids: string[] = [];
    for (let i = 0; i < 6; i += 1) {
      ids.push(orchestrator.submit({ creatorId: 'c1', prompt: `game ${i}` }).id);
      await orchestrator.drain();
    }

    // Only the newest 3 survive; the rest were evicted rather than accumulating.
    expect(orchestrator.stats().succeeded).toBe(3);
    expect(orchestrator.get(ids[0])).toBeUndefined();
    expect(orchestrator.get(ids[5])?.state).toBe('succeeded');
  });
});
