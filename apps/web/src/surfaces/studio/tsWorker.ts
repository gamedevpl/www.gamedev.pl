import { createWorker } from '@valtown/codemirror-ts/worker';
import { createSystem, createVirtualTypeScriptEnvironment } from '@typescript/vfs';
import * as Comlink from 'comlink';
import ts from 'typescript';
import { COMPILER_OPTIONS } from './tsCompilerOptions.js';
import { loadLibFiles } from './tsWorkerLibraries.js';

// GA-02: the completions worker — loaded only for an editable Code surface.

// Starts empty; main thread seeds files via updateFile after initialize() resolves.
const api = createWorker({
  env: (async () => {
    const fsMap = await loadLibFiles();
    const system = createSystem(fsMap);
    return createVirtualTypeScriptEnvironment(system, [], ts, COMPILER_OPTIONS);
  })(),
});
Comlink.expose(Object.assign(api, { deleteFile: (path: string) => api.getEnv()?.deleteFile(path) }));
