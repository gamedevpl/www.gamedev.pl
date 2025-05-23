import url from 'node:url';
import { register } from 'node:module';
import path from 'path';

const __filename = url.fileURLToPath(import.meta.url);
register('ts-node/esm', url.pathToFileURL(__filename));

const project = path.resolve('./tsconfig.json');
(await import('ts-node')).register({ project });

const { assetGenRunner } = await import('../src/runner.ts');
await assetGenRunner();
