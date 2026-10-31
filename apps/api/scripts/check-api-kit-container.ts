import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { apiKitContainerArgs } from '../src/platform/api-kit-input.js';
import { validateApiKitEvidence } from '../src/platform/api-kit-compatibility.js';
import type { ApiKitInput } from './verify-api-kit-artifacts.js';

const image = process.argv[2];
const consumerSha = process.argv[3];
assert.match(consumerSha, /^[a-f0-9]{40}$/);
const root = await mkdtemp(path.join(tmpdir(), 'api-kit-container-test-'));
const inputDir = path.join(root, 'input');
const outputDir = path.join(root, 'output');
await mkdir(inputDir);
await mkdir(outputDir);
await chmod(inputDir, 0o755);
await chmod(outputDir, 0o777);
const args = apiKitContainerArgs(image, inputDir, outputDir, process.env.API_KIT_APPARMOR_PROFILE);
const run = (command: string[]) =>
  execFileSync('docker', command, {
    encoding: 'utf8',
    timeout: 180_000,
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: path.join(root, 'host-credential') },
  });
try {
  const hostCanary = path.join(root, 'host-credential');
  await writeFile(hostCanary, 'dummy-only');
  const isolation = `
const assert=require('node:assert/strict'),fs=require('node:fs');
assert.equal(process.getuid(),10002);
assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS,undefined);
assert.equal(fs.existsSync(${JSON.stringify(hostCanary)}),false);
assert.equal(fs.existsSync('/var/run/docker.sock'),false);
assert.deepEqual(fs.readdirSync('/sys/class/net'),['lo']);
assert.throws(()=>fs.writeFileSync('/verifier/host-write','bad'));
assert.throws(()=>fs.writeFileSync('/input/write','bad'));
Promise.all(['http://169.254.169.254/','http://[fd20:ce::254]/'].map(async url=>{
  await assert.rejects(fetch(url,{signal:AbortSignal.timeout(1000)}));
})).then(()=>console.log('isolated: metadata, host files, credentials, socket and writes blocked'));
`;
  console.log(run([...args.slice(0, -1), '--entrypoint=node', image, '-e', isolation]).trim());
  const files: Record<string, string> = {
    'shared/modules/core.ts': `import {start} from './frame-loop.ts';window.GameKit={mount:start};`,
    'shared/modules/frame-loop.ts': `export function start(){
      const h=window.__GAME_HARNESS__={ready:true,frame:0};
      const c=document.querySelector('canvas').getContext('2d');
      function tick(){h.frame++;c.fillRect(0,0,32,32);requestAnimationFrame(tick)}
      requestAnimationFrame(tick);
    }`,
    'shared/game-shell.css': 'body{margin:0}',
    'starters/block-cascade/GAME.json': JSON.stringify({ engine: { modules: [] } }),
    'starters/block-cascade/index.html': '<canvas id="game" width="64" height="64"></canvas>',
    'starters/block-cascade/style.css': 'body{margin:0}',
    'starters/block-cascade/game.ts': 'GameKit.mount({});',
  };
  const input: ApiKitInput = {
    consumerSha,
    engineRef: 'a'.repeat(40),
    tarballSha256: 'b'.repeat(64),
    modes: ['ordinary-probe'],
    files: Object.fromEntries(
      Object.entries(files).map(([name, value]) => [name, Buffer.from(value).toString('base64')]),
    ),
  };
  await writeFile(path.join(inputDir, 'kit.json'), JSON.stringify(input));
  await chmod(path.join(inputDir, 'kit.json'), 0o644);
  run(args);
  validateApiKitEvidence(JSON.parse(await readFile(path.join(outputDir, 'receipt.json'), 'utf8')), {
    engineRef: input.engineRef,
    sha256: input.tarballSha256,
    consumerSha,
    modes: input.modes,
  });
  console.log('API import graph executes and advances after input in isolated Chromium');
  await rm(path.join(outputDir, 'receipt.json'));
  input.files['shared/modules/core.ts'] = Buffer.from('throw new Error("api-kit-negative-control")').toString('base64');
  await writeFile(path.join(inputDir, 'kit.json'), JSON.stringify(input));
  assert.throws(() => run(args), /api-kit-negative-control/);
  await assert.rejects(readFile(path.join(outputDir, 'receipt.json')));
  console.log('Broken API artifact rejected without a success receipt');
} finally {
  await rm(root, { recursive: true, force: true });
}
