import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { liveGameFixture } from './play-live-game-fixture.js';

const strategy = `
import {pathToFileURL} from 'node:url';
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
    const result = await promisify(execFile)(process.execPath, [
      '--input-type=module',
      '-e',
      strategy,
      setup.modulePath,
    ]);
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
