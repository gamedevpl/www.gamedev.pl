import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { liveGameFixture } from './play-live-game-fixture.js';

const strategy = `
import {pathToFileURL} from 'node:url';
import net from 'node:net';
if(process.platform!=='win32'){
  net.connect=net.createConnection=()=>{throw Error('network disabled in heuristic')};
  globalThis.fetch=()=>{throw Error('network disabled in heuristic')};
}
const {connect}=await import(pathToFileURL(process.argv[1]).href);
const client=await connect();
console.log(JSON.stringify(await client.run(async ({initial,act})=>{
  let current=initial;
  const target=Number(initial.data.observation.snapshot.x)+20;
  let decisions=0;
  while(Number(current.data.observation.snapshot.x)<target && decisions<10){
    current=await act([{kind:'press',key:'ArrowRight',frames:5}]);
    decisions++;
  }
  return {decisions,start:initial.data.observation,end:current.data.observation};
})));
`;

it.skipIf(!findChromium())('a Node heuristic controls the same game through its task MCP client', async () => {
  const fixture = await liveGameFixture();
  const browser = await chromium.launch({
    executablePath: findChromium()!,
    chromiumSandbox: chromiumSandbox().enabled,
  });
  try {
    const page = await browser.newPage();
    await page.goto(fixture.url);
    await page.frameLocator('#game').locator('canvas').waitFor();
    const agent = await fixture.agent();
    await expect
      .poll(
        async () => {
          try {
            return (await agent.call('game_observe', { screenshot: false })).tabId;
          } catch {
            return '';
          }
        },
        { timeout: 10000 },
      )
      .toBeTruthy();
    // The script and direct MCP calls must share one control owner.
    const before = await agent.call('game_take_control', { screenshot: false });
    const setup = (await agent.call('game_script_client')) as unknown as { modulePath: string };
    const nodeArgs = ['--input-type=module', '-e', strategy, setup.modulePath];
    const executable = process.platform === 'darwin' ? '/usr/bin/sandbox-exec' : process.execPath;
    const args =
      process.platform === 'darwin'
        ? ['-p', '(version 1) (allow default) (deny network*)', process.execPath, ...nodeArgs]
        : nodeArgs;
    const result = await promisify(execFile)(executable, args);
    const metrics = JSON.parse(result.stdout);
    expect(metrics.decisions).toBe(4);
    expect(metrics.start.frame).toBe(before.data.observation.frame);
    expect(metrics.end.frame).toBe(metrics.start.frame + 20);
    expect(metrics.end.snapshot.x).toBe(Number(metrics.start.snapshot.x) + 20);
    expect(await page.locator('#agent-control').isVisible()).toBe(false);
    const body = page.frameLocator('#game').locator('body');
    expect(await body.evaluate(() => (window as unknown as { fixture: { keys: Set<string> } }).fixture.keys.size)).toBe(
      0,
    );
    agent.stop();
    await expect(
      promisify(execFile)(process.execPath, ['--input-type=module', '-e', strategy, setup.modulePath]),
    ).rejects.toThrow();
  } finally {
    await browser.close();
    await fixture.close();
  }
});

it.skipIf(!findChromium()).each(['expiry', 'replacement', 'budget'])(
  'script client %s preserves creator reclaim for the current task',
  async (reason) => {
    const fixture = await liveGameFixture();
    const browser = await chromium.launch({
      executablePath: findChromium()!,
      chromiumSandbox: chromiumSandbox().enabled,
    });
    try {
      const page = await browser.newPage();
      await page.goto(fixture.url);
      await page.frameLocator('#game').locator('canvas').waitFor();
      const agent = await fixture.agent();
      await expect
        .poll(
          () =>
            agent
              .call('game_observe', { screenshot: false })
              .then((r) => r.tabId)
              .catch(() => ''),
          { timeout: 10000 },
        )
        .toBeTruthy();
      await agent.call('game_take_control', { screenshot: false });
      const setup = (await agent.call('game_script_client', {
        timeoutMs: reason === 'expiry' ? 2500 : 60000,
        maxCalls: reason === 'budget' ? 1 : 200,
      })) as unknown as { modulePath: string };
      const { connect } = await import(pathToFileURL(setup.modulePath).href);
      const client = await connect();
      if (reason === 'budget') await client.observe();
      await page.click('#agent-reclaim');
      if (reason === 'expiry') await expect.poll(() => existsSync(setup.modulePath), { timeout: 5000 }).toBe(false);
      if (reason === 'replacement') await agent.call('game_script_client');
      if (reason === 'budget') await expect(client.observe()).rejects.toThrow('budget exhausted');
      await expect(agent.call('game_take_control', { screenshot: false })).rejects.toThrow('revoked');
      await expect(agent.call('game_observe', { screenshot: false })).resolves.toHaveProperty('tabId');
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);
