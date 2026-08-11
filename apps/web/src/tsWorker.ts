import { createWorker } from '@valtown/codemirror-ts/worker';
import { createSystem, createVirtualTypeScriptEnvironment, knownLibFilesForCompilerOptions } from '@typescript/vfs';
import * as Comlink from 'comlink';
import ts from 'typescript';
import { COMPILER_OPTIONS } from './tsCompilerOptions.js';

// GA-02: the language service that backs CE-36's completions/hover (creator-code-
// gamekit-autocomplete-plan.md in the ops repo). Reached only by a dynamic import from
// CodeSurface.tsx (Worker constructor + import.meta.url), so nothing outside an open,
// editable Code surface pays for `typescript` or the lib files below.

// Every lib.*.d.ts in the typescript package, as a lazy raw-text loader per file —
// Vite splits each into its own chunk, so only the handful `knownLibFilesForCompilerOptions`
// actually needs (the ES2022 + DOM chain) are ever fetched. No CDN: self-hosted, same
// origin as everything else this site serves.
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
      map.set(fileName, await entry[1]());
    }),
  );
  return map;
}

// Starts empty: the main thread seeds every game file (and the kit declaration) via
// the exposed `updateFile` after `initialize()` resolves — see
// codeSurfaceLanguageService.ts's `createCodeSurfaceLanguageService`. `createOrUpdateFile`
// (codemirror-ts's own sync helper) creates a file that doesn't exist yet, so this is
// the same call for "seed" and "edit", not a separate channel.
Comlink.expose(
  createWorker({
    env: (async () => {
      const fsMap = await loadLibFiles();
      const system = createSystem(fsMap);
      return createVirtualTypeScriptEnvironment(system, [], ts, COMPILER_OPTIONS);
    })(),
  }),
);
