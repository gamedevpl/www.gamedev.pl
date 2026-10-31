import { describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claude, createAgentSession, type AgentSession, type CodingAgent, type AgentResult } from 'genaicode/agents';
import type { AppAgentState } from 'genaicode/app-agent';
import { createSessionController } from './session-controller.js';
import { trackPlaySteering } from './play-brain-steering.js';

function asApp(agent: AgentSession) {
  const get = () => ({ session: agent.get() }) as AppAgentState;
  return { send: agent.send, get, subscribe: (fn: (state: AppAgentState) => void) => agent.subscribe(() => fn(get())) };
}

describe('Play agent delivery', () => {
  it('waits for the Claude driver replay before confirming delivery', async () => {
    const root = mkdtempSync(join(tmpdir(), 'play-steer-'));
    const command = join(root, 'claude');
    writeFileSync(
      command,
      `#!/usr/bin/env node
const rl = require('node:readline').createInterface({ input: process.stdin });
let count = 0;
rl.on('line', line => {
  const message = JSON.parse(line);
  const delay = count++ === 0 ? 0 : 250;
  setTimeout(() => console.log(JSON.stringify({ ...message, isReplay: true })), delay);
});
`,
    );
    chmodSync(command, 0o755);
    const tracker = trackPlaySteering();
    const agent = createAgentSession({ agent: tracker.wrap(claude({ command })), cwd: root });
    const play = createSessionController('');
    try {
      agent.send('initial task');
      await vi.waitFor(() => expect(agent.get().canSteer).toBe(true));
      play.setLocalTask('claude');
      play.setSteering(tracker.send(asApp(agent), new AbortController().signal));
      await play.steerInput('follow-up', play.get().taskId);
      expect(play.get().deliveries[0]?.status).toBe('pending');
      await vi.waitFor(() => expect(play.get().deliveries[0]?.status).toBe('received'));
    } finally {
      play.close();
      agent.close();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('reports confirmation only after the running agent acknowledges each message', async () => {
    const callbacks: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    const tracker = trackPlaySteering();
    const driver: CodingAgent = {
      name: 'claude',
      command: 'fake',
      capabilities: { steer: true },
      run: () => ({
        result: new Promise(() => {}),
        abort() {},
        steer: () => new Promise<void>((resolve, reject) => callbacks.push({ resolve, reject })),
        async *[Symbol.asyncIterator]() {
          yield* [];
          await new Promise(() => {});
        },
      }),
    };
    const agent = createAgentSession({ agent: tracker.wrap(driver), cwd: process.cwd() });
    const stop = new AbortController();
    agent.send('initial task');
    const play = createSessionController('');
    play.setLocalTask('claude');
    play.setSteering(tracker.send(asApp(agent), stop.signal));
    const taskId = play.get().taskId;
    expect(await play.steerInput('first follow-up', taskId)).toBe(true);
    expect(await play.steerInput('second follow-up', taskId)).toBe(true);
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['pending', 'pending']);
    callbacks[0]!.resolve();
    await vi.waitFor(() => expect(play.get().deliveries.map((item) => item.status)).toEqual(['received', 'pending']));
    callbacks[1]!.reject(new Error('not taken'));
    await Promise.resolve();
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['received', 'pending']);
    expect(agent.get().queued).toEqual(['second follow-up']);
    stop.abort();
    await vi.waitFor(() => expect(play.get().deliveries[1]?.status).toBe('unconfirmed'));
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['received', 'unconfirmed']);
    play.close();
    agent.close();
  });

  it('matches identical queued messages to separate completed turns', async () => {
    const finish: Array<(result: AgentResult) => void> = [];
    const tracker = trackPlaySteering();
    const driver: CodingAgent = {
      name: 'claude',
      command: 'fake',
      capabilities: { resume: true },
      run: () => {
        const result = new Promise<AgentResult>((resolve) => finish.push(resolve));
        return {
          result,
          abort() {},
          async *[Symbol.asyncIterator]() {
            await result;
            yield* [];
          },
        };
      },
    };
    const agent = createAgentSession({ agent: tracker.wrap(driver), cwd: process.cwd() });
    const stop = new AbortController();
    const play = createSessionController('');
    const success: AgentResult = { status: 'completed', ok: true, exitCode: 0, signal: null, sessionId: 'session' };
    agent.send('initial');
    play.setLocalTask('claude');
    play.setSteering(tracker.send(asApp(agent), stop.signal));
    await play.steerInput('same message', play.get().taskId);
    await play.steerInput('same message', play.get().taskId);
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['queued', 'queued']);
    finish[0]!(success);
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    finish[1]!(success);
    await vi.waitFor(() => expect(play.get().deliveries.map((item) => item.status)).toEqual(['received', 'queued']));
    await vi.waitFor(() => expect(finish).toHaveLength(3));
    finish[2]!(success);
    await vi.waitFor(() => expect(play.get().deliveries.map((item) => item.status)).toEqual(['received', 'received']));
    stop.abort();
    play.close();
    agent.close();
  });

  it('confirms a rejected steer only after its queued retry finishes', async () => {
    const finish: Array<(result: AgentResult) => void> = [];
    const tracker = trackPlaySteering();
    const driver: CodingAgent = {
      name: 'claude',
      command: 'fake',
      capabilities: { resume: true, steer: true },
      run: () => {
        const result = new Promise<AgentResult>((resolve) => finish.push(resolve));
        return {
          result,
          abort() {},
          steer: async () => {
            throw new Error('turn ended');
          },
          async *[Symbol.asyncIterator]() {
            await result;
            yield* [];
          },
        };
      },
    };
    const agent = createAgentSession({ agent: tracker.wrap(driver), cwd: process.cwd() });
    const stop = new AbortController();
    const play = createSessionController('');
    const success: AgentResult = { status: 'completed', ok: true, exitCode: 0, signal: null, sessionId: 'session' };
    agent.send('initial');
    play.setLocalTask('claude');
    play.setSteering(tracker.send(asApp(agent), stop.signal));
    await play.steerInput('follow-up', play.get().taskId);
    await vi.waitFor(() => expect(agent.get().queued).toEqual(['follow-up']));
    expect(play.get().deliveries[0]?.status).toBe('pending');
    finish[0]!(success);
    await vi.waitFor(() => expect(finish).toHaveLength(2));
    finish[1]!(success);
    await vi.waitFor(() => expect(play.get().deliveries[0]?.status).toBe('received'));
    stop.abort();
    play.close();
    agent.close();
  });

  it('marks queued messages unconfirmed when stopped and accepts a later real receipt', async () => {
    let resolve!: () => void;
    const play = createSessionController('');
    play.setLocalTask('claude');
    play.setSteering(async () => ({
      status: 'pending',
      confirmation: new Promise<void>((done) => {
        resolve = done;
      }),
    }));
    const taskId = play.get().taskId;
    await play.steerInput('one', taskId);
    play.setSteering(async () => ({ status: 'queued', confirmation: new Promise<void>(() => {}) }));
    await play.steerInput('two', taskId);
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['pending', 'queued']);
    expect(play.stopTask(taskId)).toBe(true);
    resolve();
    await Promise.resolve();
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['received', 'unconfirmed']);
    play.close();
  });
});
