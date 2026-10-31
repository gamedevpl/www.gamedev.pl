import { describe, expect, it, vi } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claude, createAgentSession, type CodingAgent } from 'genaicode/agents';
import { createSessionController } from './session-controller.js';
import { trackPlaySteering } from './play-brain-steering.js';

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
      play.setSteering(tracker.send(agent));
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
          await new Promise(() => {});
        },
      }),
    };
    const agent = createAgentSession({ agent: tracker.wrap(driver), cwd: process.cwd() });
    agent.send('initial task');
    const play = createSessionController('');
    play.setLocalTask('claude');
    play.setSteering(tracker.send(agent));
    const taskId = play.get().taskId;
    expect(await play.steerInput('first follow-up', taskId)).toBe(true);
    expect(await play.steerInput('second follow-up', taskId)).toBe(true);
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['pending', 'pending']);
    callbacks[0]!.resolve();
    await Promise.resolve();
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['received', 'pending']);
    callbacks[1]!.reject(new Error('not taken'));
    await Promise.resolve();
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['received', 'unconfirmed']);
    expect(agent.get().queued).toEqual(['second follow-up']);
    play.close();
    agent.close();
  });

  it('marks queued messages unconfirmed when stopped, even if a late receipt arrives', async () => {
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
    play.setSteering(async () => ({ status: 'queued' }));
    await play.steerInput('two', taskId);
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['pending', 'queued']);
    expect(play.stopTask(taskId)).toBe(true);
    resolve();
    await Promise.resolve();
    expect(play.get().deliveries.map((item) => item.status)).toEqual(['unconfirmed', 'unconfirmed']);
    play.close();
  });
});
