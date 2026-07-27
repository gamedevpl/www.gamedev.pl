/**
 * The rule resolves specifiers against the filesystem, so these tests write a real
 * fixture tree to a temp directory and lint strings whose `filename` points into it.
 * Nothing here can pass by accident from a stubbed resolver: `./dir` only becomes
 * `./dir/index.js` because `dir/index.ts` exists on disk.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RuleTester } from 'eslint';
import { afterAll, describe, it } from 'vitest';
import { relativeImportExtensions } from './relative-import-extensions.mjs';

// RuleTester calls these itself; vitest only exposes them as globals with
// `globals: true`, which the root config does not set.
RuleTester.describe = describe;
RuleTester.it = it;

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'relative-import-extensions-'));
fs.mkdirSync(path.join(fixtureRoot, 'dir'));
fs.mkdirSync(path.join(fixtureRoot, 'component'));
fs.writeFileSync(path.join(fixtureRoot, 'sibling.ts'), '');
fs.writeFileSync(path.join(fixtureRoot, 'dir', 'index.ts'), '');
fs.writeFileSync(path.join(fixtureRoot, 'component', 'index.tsx'), '');
fs.writeFileSync(path.join(fixtureRoot, 'styles.css'), '');
// A directory that also has a same-named file: file wins, so `./both` must not
// become `./both/index.js`.
fs.mkdirSync(path.join(fixtureRoot, 'both'));
fs.writeFileSync(path.join(fixtureRoot, 'both', 'index.ts'), '');
fs.writeFileSync(path.join(fixtureRoot, 'both.ts'), '');

afterAll(() => {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

/** The file being linted. Only its directory matters — it need not exist. */
const filename = path.join(fixtureRoot, 'entry.ts');

const ruleTester = new RuleTester();

ruleTester.run('relative-import-extensions', relativeImportExtensions, {
  valid: [
    { code: "import { a } from './sibling.js';", filename },
    { code: "import { a } from './dir/index.js';", filename },
    // Not our business: bare specifiers have no filesystem relationship to resolve.
    { code: "import path from 'node:path';", filename },
    { code: "import React from 'react';", filename },
    { code: "import styles from './styles.css';", filename },
    { code: "import logo from './logo.svg';", filename },
    { code: "import data from './data.json';", filename },
    // A computed specifier cannot be checked, so it must not be guessed at.
    { code: 'const mod = await import(`./${name}`);', filename },
    // Piped source has no directory to resolve against; every specifier would
    // otherwise look unresolvable.
    { code: "import { a } from './sibling';", filename: '<input>' },
  ],
  invalid: [
    {
      code: "import { a } from './sibling';",
      filename,
      errors: [{ messageId: 'missing' }],
      output: "import { a } from './sibling.js';",
    },
    // The case a blind '.js' append would break: './dir.js' does not exist.
    {
      code: "import { a } from './dir';",
      filename,
      errors: [{ messageId: 'missing' }],
      output: "import { a } from './dir/index.js';",
    },
    {
      code: "import Component from './component';",
      filename,
      errors: [{ messageId: 'missing' }],
      output: "import Component from './component/index.js';",
    },
    // A trailing slash names the directory explicitly and must not survive the fix.
    {
      code: "import { a } from './dir/';",
      filename,
      errors: [{ messageId: 'missing' }],
      output: "import { a } from './dir/index.js';",
    },
    // File beats directory when both exist.
    {
      code: "import { a } from './both';",
      filename,
      errors: [{ messageId: 'missing' }],
      output: "import { a } from './both.js';",
    },
    // Reported but deliberately not fixed — nothing on disk says what it meant.
    {
      code: "import { a } from './nowhere';",
      filename,
      errors: [{ messageId: 'unresolved' }],
      output: null,
    },
    // allowImportingTsExtensions makes this legal in apps/web, but the specifier
    // names a file that does not exist after compilation.
    {
      code: "import { a } from './sibling.ts';",
      filename,
      errors: [{ messageId: 'typescript' }],
      output: "import { a } from './sibling.js';",
    },
    {
      code: "import Component from './component/index.tsx';",
      filename,
      errors: [{ messageId: 'typescript' }],
      output: "import Component from './component/index.js';",
    },
    // A .ts specifier is rewritten from what was written, without consulting the
    // filesystem — so it reports even when nothing resolves.
    {
      code: "import { a } from './nowhere.ts';",
      filename,
      errors: [{ messageId: 'typescript' }],
      output: "import { a } from './nowhere.js';",
    },
    {
      code: "export { a } from './sibling';",
      filename,
      errors: [{ messageId: 'missing' }],
      output: "export { a } from './sibling.js';",
    },
    {
      code: "export * from './dir';",
      filename,
      errors: [{ messageId: 'missing' }],
      output: "export * from './dir/index.js';",
    },
    {
      code: "const mod = await import('./sibling');",
      filename,
      errors: [{ messageId: 'missing' }],
      output: "const mod = await import('./sibling.js');",
    },
    // The parent-relative form apps/web uses most.
    {
      code: "import { a } from '../sibling';",
      filename: path.join(fixtureRoot, 'dir', 'nested.ts'),
      errors: [{ messageId: 'missing' }],
      output: "import { a } from '../sibling.js';",
    },
    // The fix rewrites the whole literal, so it must preserve the original quoting
    // rather than hand prettier a file to reformat.
    {
      code: 'import { a } from "./sibling";',
      filename,
      errors: [{ messageId: 'missing' }],
      output: 'import { a } from "./sibling.js";',
    },
  ],
});
