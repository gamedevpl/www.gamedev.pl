import { readFile, writeFile } from 'node:fs/promises';
import { createGitHubClient } from '../src/catalog/github-client.js';
import { createGameArtifactBrowser } from '../src/catalog/game-artifact-browser.js';
import { assembleGameHtml, projectFromSources } from '../src/platform/assemble.js';

export type ApiKitInput = {
  consumerSha: string;
  engineRef: string;
  tarballSha256: string;
  modes: string[];
  files: Record<string, string>;
};

export async function verifyApiKitArtifacts(input: ApiKitInput, executablePath: string, noSandbox = false) {
  const files = new Map(Object.entries(input.files).map(([name, bytes]) => [name, Buffer.from(bytes, 'base64')]));
  const starter = 'starters/block-cascade/';
  for (const slug of input.modes) {
    for (const [name, bytes] of files) {
      if (name.startsWith(starter)) files.set(`games/${slug}/${name.slice(starter.length)}`, bytes);
    }
  }
  if (input.modes.includes('hot-probe')) {
    const manifest = JSON.parse(files.get('games/hot-probe/GAME.json')!.toString('utf8'));
    manifest.hot = {
      protocol: 1,
      id: 'api-kit-probe',
      stateVersion: 1,
      observationVersion: 1,
      behavior: 'game/behavior.ts',
    };
    files.set('games/hot-probe/GAME.json', Buffer.from(JSON.stringify(manifest)));
    files.set(
      'games/hot-probe/game.ts',
      Buffer.from(`
export default function boot(builder) {
  return builder.renderer({width:320,height:180}).input({steer:'origin'}).audio().init(()=>({ticks:0}));
}`),
    );
    files.set(
      'games/hot-probe/game/behavior.ts',
      Buffer.from(`
export default {
  update(round){round.ticks++},
  render(round,kit){kit.draw.clear('#112233');kit.draw.rect(10+round.ticks%100,20,10,10,'#ffee11')},
  snapshot(round){return {ticks:round.ticks}}
}`),
    );
  }
  const client = createGitHubClient({
    token: 'offline-api-kit-check',
    repo: 'local/kit',
    fetchImpl: async () => Response.json({ sha: input.engineRef }),
    files: {
      readText: async (name) => files.get(name)?.toString('utf8') ?? null,
      readBytes: async (name) => files.get(name) ?? null,
    },
  });
  const browser = await createGameArtifactBrowser({ executablePath, noSandbox });
  try {
    const artifacts = [];
    for (const slug of input.modes) {
      const sources = await client.getGameSources(input.engineRef, slug);
      if (!sources) throw new Error(`Missing Kit probe ${slug}`);
      const html = assembleGameHtml(projectFromSources(sources, slug), { restrictNetwork: true });
      artifacts.push({ slug, ...(await browser.verify({ slug, title: slug, html, engineRef: input.engineRef })) });
    }
    return {
      version: 1,
      consumerSha: input.consumerSha,
      engineRef: input.engineRef,
      tarballSha256: input.tarballSha256,
      artifacts,
    };
  } finally {
    await browser.close();
  }
}

if (process.argv[2] === '--container') {
  const input = JSON.parse(await readFile('/input/kit.json', 'utf8')) as ApiKitInput;
  if ((await readFile('/verifier/api-ref.txt', 'utf8')).trim() !== input.consumerSha) {
    throw new Error('API verifier image has a different source identity');
  }
  const result = await verifyApiKitArtifacts(input, '/usr/bin/chromium');
  await writeFile('/result/receipt.json', JSON.stringify(result) + '\n', { mode: 0o644 });
}
