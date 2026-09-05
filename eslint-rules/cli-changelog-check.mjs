// PR guard: a change to the shipped CLI must move apps/cli/CHANGELOG.md.
//
//   npm run cli:changelog                       diff against origin/master locally
//   node eslint-rules/cli-changelog-check.mjs --files a.ts,b.ts   explicit list (CI)
//
// Wired into `npm run lint`; without a base to diff against it validates structure only.

import { execFileSync } from 'node:child_process';
import { CHANGELOG_PATH, cliSourceTouched, parseChangelog, readRepoFile, REPO_ROOT } from './cli-changelog-lib.mjs';

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function changedFilesFromGit() {
  try {
    const base = git(['merge-base', 'origin/master', 'HEAD']);
    const committed = git(['diff', '--name-only', base, 'HEAD']);
    const working = git(['diff', '--name-only', 'HEAD']);
    const untracked = git(['ls-files', '--others', '--exclude-standard']);
    return [...new Set(`${committed}\n${working}\n${untracked}`.split('\n').filter(Boolean))];
  } catch {
    return null;
  }
}

function main() {
  const argv = process.argv.slice(2);
  const filesIndex = argv.indexOf('--files');
  let files = null;
  if (filesIndex !== -1) {
    files = (argv[filesIndex + 1] ?? '')
      .split(/[,\n]/)
      .map((f) => f.trim())
      .filter(Boolean);
  }

  const parsed = parseChangelog(readRepoFile(CHANGELOG_PATH));
  if (parsed.errors.length > 0) {
    console.error(`${CHANGELOG_PATH} is malformed:`);
    for (const error of parsed.errors) console.error(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  if (files === null) files = changedFilesFromGit();
  if (files === null) {
    console.log(`CLI changelog: structure OK (no origin/master to diff against, skipping the guard).`);
    return;
  }

  if (!cliSourceTouched(files)) {
    console.log('CLI changelog: no shipped CLI change in this diff.');
    return;
  }
  if (files.includes(CHANGELOG_PATH)) {
    console.log('CLI changelog: entry present for this CLI change.');
    return;
  }

  console.error(`CLI changelog: this diff changes the shipped CLI but not ${CHANGELOG_PATH}.`);
  console.error('  Add one line under "## Unreleased" in the right category:');
  console.error('    ### Breaking | ### Added | ### Fixed   -> cuts a release');
  console.error('    ### Internal                          -> recorded, no release');
  console.error('  See .claude/skills/cli-release/SKILL.md');
  process.exitCode = 1;
}

main();
