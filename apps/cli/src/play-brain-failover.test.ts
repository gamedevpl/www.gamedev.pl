import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentEvent, AgentResult, CodingAgent } from 'genaicode/agents';
import type { AdapterSpec } from './adapters.js';
import type { ApiClient } from './api.js';
import { readFallback, saveFallback } from './agent-settings.js';
import { writeGameFiles } from './checkout.js';
import { fallbackCommand } from './fallback-command.js';
import { startPlayBrain, type PlayBrain } from './play-brain.js';
import { usableAgents } from './play-brain-agents.js';
import type { Workshop } from './workshop.js';

// An agent that ends every run with `result`, saying `text`.
function fake(name: string, result: AgentResult, text = ''): CodingAgent & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    name,
    command: process.execPath,
    capabilities: { resume: true, mcp: true, approvals: true },
    prompts,
    run(task) {
      prompts.push(task.prompt);
      return {
        result: Promise.resolve(result),
        abort() {},
        async *[Symbol.asyncIterator]() {
          const events: AgentEvent[] = [
            ...(text ? [{ type: 'message' as const, text }] : []),
            { type: 'done', result },
          ];
          yield* events;
        },
      };
    },
  };
}

const roots: string[] = [];
const brains: PlayBrain[] = [];
afterEach(async () => {
  for (const brain of brains.splice(0)) await brain.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function workshop(): Workshop {
  const root = mkdtempSync(join(tmpdir(), 'play-failover-'));
  roots.push(root);
  writeGameFiles(root, 'snake', [{ path: 'game.ts', content: 'export const speed = 1;\n' }]);
  writeFileSync(join(root, '.gamedev-slug'), 'snake');
  return {
    slug: 'snake',
    root,
    token: 'tok',
    env: { XDG_CONFIG_HOME: root },
    adapters: ['claude', 'codex'].map((name) => ({ name, command: name }) as AdapterSpec),
    builder: 'self',
    pick: async (choices) => choices.at(-1)!,
    abort: { current: null },
    runAdapter: async () => ({ code: 0 }),
    run: () => ({ status: 0, stderr: '' }),
  };
}

const api: ApiClient = {
  origin: 'https://gamedev.test',
  request: async <T>() => ({ locked: false, canTakeOver: false, jobId: 1, generation: 1 }) as T,
  requestBytes: async () => Buffer.alloc(0),
};

describe('Play failover', () => {
  it('saves the agents /fallback picks, in order, and turns it off', () => {
    const env = workshop().env;
    const lines: string[] = [];
    const write = (line: string) => lines.push(line);
    fallbackCommand({ args: [], env, write });
    expect(lines[0]).toBe('Fallback: off');
    fallbackCommand({ args: ['codex,agy', 'codex'], env, write });
    expect(readFallback(env)).toEqual(['codex', 'agy']);
    expect(() => fallbackCommand({ args: ['muse'], env, write })).toThrow(/muse cannot take over Play/);
    fallbackCommand({ args: ['off'], env, write });
    expect(readFallback(env)).toEqual([]);
  });

  it('hands a turn to the next picked agent when the agent runs out, and stays with it', async () => {
    const ws = workshop();
    saveFallback(['codex'], ws.env);
    const out: AgentResult = {
      status: 'failed',
      ok: false,
      exitCode: 1,
      signal: null,
      error: 'usage limit',
      failure: { kind: 'quota' },
    };
    const claude = fake('claude', out);
    const codex = fake(
      'codex',
      { status: 'completed', ok: true, exitCode: 0, signal: null, sessionId: 'c1' },
      'took over',
    );
    const lines: string[] = [];
    const brain = (await startPlayBrain({
      api,
      ws,
      prompt: async (choices) => choices.at(-1)!,
      write: (line) => lines.push(line),
      activity: () => {},
      agents: () => [claude, codex],
      ready: async () => true,
    }))!;
    brains.push(brain);
    expect(brain.agent.get().fallback).toEqual(['codex']);
    await brain.turn('what does the snake eat?');
    expect(lines).toContain('! claude ran out (quota); codex takes over');
    expect(lines).toContain('took over');
    expect(codex.prompts.at(-1)).toContain('what does the snake eat?');
    expect(brain.agent.get().agent).toBe('codex');
  });

  it('leaves out an agent whose preflight refuses, so a signed-out Claude hands Play to the next', async () => {
    const skipped: string[] = [];
    const check = async (name: string) => {
      if (name === 'claude') throw new Error('not signed in with a subscription');
    };
    const skip = (name: string) => skipped.push(name);
    expect(await usableAgents(['claude', 'codex'], check, skip)).toEqual(['codex']);
    expect(await usableAgents(['codex', 'claude', 'agy'], check, skip)).toEqual(['codex', 'agy']);
    expect(skipped).toEqual(['claude', 'claude']);
    await expect(usableAgents(['claude'], check, skip)).rejects.toThrow('not signed in with a subscription');
  });

  it('leaves failover off until the creator picks agents', async () => {
    const ws = workshop();
    const brain = (await startPlayBrain({
      api,
      ws,
      prompt: async (choices) => choices.at(-1)!,
      write: () => {},
      activity: () => {},
      agents: () => [fake('claude', { status: 'completed', ok: true, exitCode: 0, signal: null })],
      ready: async () => true,
    }))!;
    brains.push(brain);
    expect(brain.agent.get().fallback).toEqual([]);
  });
});
