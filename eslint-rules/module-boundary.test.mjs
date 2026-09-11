/**
 * Builds a small fixture tree under a fake `apps/api/src` so `classifyModule` sees real
 * bucket assignments (`votes` -> community, `mp` -> realtime, ...) without depending on
 * the actual repo tree, then lints real specifiers against it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { afterAll, describe, it } from 'vitest';
import { moduleBoundary } from './module-boundary.mjs';

RuleTester.describe = describe;
RuleTester.it = it;

// `import type` / `export type` are TS syntax -- the default espree parser rejects them,
// so cases exercising the type-only exemption need the real TS parser.
const tsLanguageOptions = { parser: tsParser, sourceType: 'module', ecmaVersion: 'latest' };

const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'module-boundary-'));
const apiSrcRoot = path.join(repoRoot, 'apps', 'api', 'src');
fs.mkdirSync(apiSrcRoot, { recursive: true });
fs.mkdirSync(path.join(apiSrcRoot, 'store'));
fs.mkdirSync(path.join(apiSrcRoot, '__tests__'));

for (const name of [
  'votes',
  'review',
  'mp',
  'presence',
  'store',
  'app',
  'store/records',
  'platform/store',
  'unlisted-util',
  'unlisted-importer',
]) {
  const target = path.join(apiSrcRoot, `${name}.ts`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '');
}
fs.writeFileSync(path.join(apiSrcRoot, '__tests__', 'cross-domain-fixture.ts'), '');

afterAll(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

const filenameIn = (relativeDir, base) => path.join(apiSrcRoot, relativeDir, `${base}.ts`);

const ruleTester = new RuleTester();

ruleTester.run('module-boundary', moduleBoundary, {
  valid: [
    // community importing its own bucket sibling.
    { code: "import { a } from './review.js';", filename: filenameIn('.', 'votes') },
    // community importing platform (the composition root / shared primitives).
    { code: "import { a } from './app.js';", filename: filenameIn('.', 'votes') },
    // community importing the Store, which is always platform regardless of subpath.
    { code: "import { a } from './store.js';", filename: filenameIn('.', 'votes') },
    { code: "import { a } from './store/records.js';", filename: filenameIn('.', 'votes') },
    // The Store orchestration file itself, after Phase 3 Wave A relocated it into platform/
    // (a real, mapped bucket) -- still always platform, not the unmapped-target case below.
    { code: "import { a } from './platform/store.js';", filename: filenameIn('.', 'votes') },
    // Two unmapped files reaching each other say nothing yet -- neither bucket is known.
    { code: "import { a } from './unlisted-util.js';", filename: filenameIn('.', 'unlisted-importer') },
    // platform importing a domain file is unrestricted (composition root wires everyone up).
    { code: "import { a } from './votes.js';", filename: filenameIn('.', 'app') },
    // Bare specifiers and unresolvable relative paths are not this rule's business.
    { code: "import path from 'node:path';", filename: filenameIn('.', 'votes') },
    { code: "import { a } from './nowhere.js';", filename: filenameIn('.', 'votes') },
    // Outside apps/api/src entirely.
    { code: "import { a } from './x.js';", filename: path.join(repoRoot, 'apps', 'web', 'src', 'App.ts') },
    // Test fixtures are exempt -- they wire across domains deliberately.
    { code: "import { a } from '../mp.js';", filename: path.join(apiSrcRoot, '__tests__', 'cross-domain-fixture.ts') },
    // Whole-statement type-only edges are erased at compile time -- no runtime coupling.
    {
      code: "import type { A } from './mp.js';",
      filename: filenameIn('.', 'votes'),
      languageOptions: tsLanguageOptions,
    },
    {
      code: "export type { A } from './mp.js';",
      filename: filenameIn('.', 'review'),
      languageOptions: tsLanguageOptions,
    },
  ],
  invalid: [
    // A mixed import (one real value alongside an inline type specifier) still pulls in a
    // runtime dependency -- the exemption is whole-statement only.
    {
      code: "import { a, type B } from './mp.js';",
      filename: filenameIn('.', 'votes'),
      languageOptions: tsLanguageOptions,
      errors: [{ messageId: 'crossBucket' }],
    },
    // community reaching into realtime's internals.
    {
      code: "import { a } from './mp.js';",
      filename: filenameIn('.', 'votes'),
      errors: [{ messageId: 'crossBucket' }],
    },
    {
      code: "export { a } from './presence.js';",
      filename: filenameIn('.', 'review'),
      errors: [{ messageId: 'crossBucket' }],
    },
    {
      code: "const m = await import('./mp.js');",
      filename: filenameIn('.', 'votes'),
      errors: [{ messageId: 'crossBucket' }],
    },
    // A mapped importer reaching an unmapped file: the edge can't be checked, but it's
    // flagged rather than silently trusted as platform.
    {
      code: "import { a } from './unlisted-util.js';",
      filename: filenameIn('.', 'votes'),
      errors: [{ messageId: 'unmappedTarget' }],
    },
    // An unmapped file reaching a real, known domain: its own bucket needs classifying
    // before this edge means anything.
    {
      code: "import { a } from './votes.js';",
      filename: filenameIn('.', 'unlisted-importer'),
      errors: [{ messageId: 'unmappedImporter' }],
    },
  ],
});
