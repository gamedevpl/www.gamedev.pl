import { build } from 'esbuild';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const generated = join(root, 'src/generated');
await mkdir(generated, { recursive: true });
const shared = {
  bundle: true,
  minify: true,
  logLevel: 'warning',
  loader: { '.woff': 'dataurl', '.woff2': 'dataurl' },
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
    ';\n',
);
await rm(serverFile);
