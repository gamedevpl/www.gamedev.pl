import { createWorker } from '@valtown/codemirror-ts/worker';
import { createSystem, createVirtualTypeScriptEnvironment, knownLibFilesForCompilerOptions } from '@typescript/vfs';
import * as Comlink from 'comlink';
import ts from 'typescript';
import { COMPILER_OPTIONS } from './tsCompilerOptions.js';

// GA-02: the completions worker — loaded only for an editable Code surface.

// Lib .d.ts files load lazily via Vite chunks — no CDN.
const libLoaders = import.meta.glob('../../../node_modules/typescript/lib/lib*.d.ts', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>;

async function loadLibFiles(): Promise<Map<string, string>> {
  const needed = knownLibFilesForCompilerOptions(COMPILER_OPTIONS, ts);
  const map = new Map<string, string>();
  await Promise.all(
    needed.map(async (fileName) => {
      const entry = Object.entries(libLoaders).find(([path]) => path.endsWith(`/${fileName}`));
      if (!entry) return;
      // vfs roots paths at "/" — unprefixed keys leave every global unresolved.
      map.set(`/${fileName}`, await entry[1]());
    }),
  );
  return map;
}

// Starts empty; main thread seeds files via updateFile after initialize() resolves.
const api = createWorker({
  env: (async () => {
    const fsMap = await loadLibFiles();
    const system = createSystem(fsMap);
    return createVirtualTypeScriptEnvironment(system, [], ts, COMPILER_OPTIONS);
  })(),
});
Comlink.expose(Object.assign(api, { deleteFile: (path: string) => api.getEnv()?.deleteFile(path) }));
