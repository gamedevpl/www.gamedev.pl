import { build } from 'esbuild';
import { mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const generated = join(root, 'src/generated');
await mkdir(generated, { recursive: true });
const shared = {
  bundle: true,
  minify: true,
  logLevel: 'warning',
  loader: { '.woff2': 'dataurl' },
  plugins: [
    {
      name: 'play-shared-fonts',
      setup(build) {
        build.onLoad({ filter: /core[/\\]styles[/\\]tokens\.css$/ }, async ({ path }) => ({
          contents: (await readFile(path, 'utf8'))
            .replace(/@font-face\s*\{[^}]*font-weight:\s*300;[^}]*\}/g, '')
            .replace(/,\s*url\([^)]*\.woff['"]?\)\s*format\(['"]woff['"]\)/g, ''),
          loader: 'css',
          resolveDir: dirname(path),
        }));
      },
    },
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
};
const serverFile = join(generated, 'play-shell.mjs');
await build({
  ...shared,
  entryPoints: [join(root, 'browser/server.tsx')],
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: serverFile,
});
const { markup } = await import(pathToFileURL(serverFile).href + '?' + Date.now());
const client = await build({
  ...shared,
  entryPoints: [join(root, 'browser/client.tsx')],
  platform: 'browser',
  format: 'iife',
  target: 'es2022',
  outfile: 'play.js',
  write: false,
});
const script = client.outputFiles.find((f) => f.path.endsWith('.js')).text;
const css = client.outputFiles.find((f) => f.path.endsWith('.css')).text;
const embedding = await build({
  stdin: {
    contents: "export { embedGameHtml } from '../../../packages/contract/src/game-embed.ts';",
    resolveDir: join(root, 'browser'),
    loader: 'ts',
  },
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: 'GAME_EMBED',
  write: false,
});
await writeFile(
  join(generated, 'play-ui.ts'),
  'export const PLAY_MARKUP = ' +
    JSON.stringify(markup) +
    ';\n' +
    'export const PLAY_CLIENT = ' +
    JSON.stringify(script.replace(/<\/script/gi, '<\\/script')) +
    ';\n' +
    'export const PLAY_STYLE = ' +
    JSON.stringify(css) +
    ';\n' +
    'export const PLAY_EMBED_SCRIPT = ' +
    JSON.stringify(embedding.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')) +
    ';\n',
);
await rm(serverFile);
const runtime = await build({
  entryPoints: [join(root, 'scripts/play-runtime-entry.mjs')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  write: false,
  banner: { js: 'import {createRequire} from "node:module";const require=createRequire(import.meta.url);' },
});
await writeFile(
  join(generated, 'play-runtime.ts'),
  'export const PLAY_RUNTIME = ' + JSON.stringify(runtime.outputFiles[0].text) + ';\n',
);
