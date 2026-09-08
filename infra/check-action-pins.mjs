#!/usr/bin/env node
// Assert every third-party GitHub Action is pinned to a commit SHA.
//
// A tag is a moving pointer, not a version: `@v4` resolves afresh on every run, and the
// action's owner — or whoever takes over that account — can repoint it at any commit. So
// the code that runs in a job is not the code anyone reviewed.
//
// That matters here because of what the deploy job holds: `id-token: write`, a Workload
// Identity credential that deploys Cloud Run, and a production access token. A step that
// runs before the auth step can still mint the OIDC token itself, since the permission
// belongs to the job. tj-actions/changed-files was compromised exactly this way in March
// 2025 — a tag repointed at a commit that dumped secrets into build logs.
//
// Google's actions were already pinned when this check was written; this is what stops the
// rest of the file from drifting back to tags.
//
// Local `./…` references are exempt: they are this repository, at this commit.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const roots = [path.join(repoRoot, '.github', 'workflows'), path.join(repoRoot, '.github', 'actions')];

function yamlFilesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return yamlFilesUnder(full);
    return /\.ya?ml$/.test(entry.name) ? [full] : [];
  });
}

const SHA = /^[0-9a-f]{40}$/;
const failures = [];
let pinned = 0;

for (const file of roots.flatMap(yamlFilesUnder)) {
  const rel = path.relative(repoRoot, file);
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      const match = /^\s*(?:-\s*)?uses:\s*(\S+)/.exec(line);
      if (!match) return;
      const reference = match[1];
      if (reference.startsWith('./') || reference.startsWith('docker://')) return;
      const at = reference.lastIndexOf('@');
      if (at === -1) {
        failures.push(`${rel}:${index + 1} — ${reference} has no version at all`);
        return;
      }
      const version = reference.slice(at + 1);
      if (SHA.test(version)) pinned += 1;
      else
        failures.push(
          `${rel}:${index + 1} — ${reference} is pinned to a tag; use the commit SHA with a "# ${version}" comment`,
        );
    });
}

if (failures.length > 0) {
  console.error('GitHub Action pins:');
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error('  Resolve a tag with: git ls-remote https://github.com/<owner>/<repo> "refs/tags/<tag>^{}"');
  process.exit(1);
}

console.log(`GitHub Actions: ${pinned} third-party references, every one pinned to a commit SHA.`);
