// Release plumbing driven by apps/cli/CHANGELOG.md.
//
//   node apps/cli/scripts/release.mjs next            next version, or "none"
//   node apps/cli/scripts/release.mjs cut [--date D]  move Unreleased under a version, bump versions
//   node apps/cli/scripts/release.mjs notes 0.2.0     print that version's notes
//
// Automatic release on master runs `cut`, commits, tags, and publishes.

import {
  bumpKind,
  bumpVersionStrings,
  CHANGELOG_PATH,
  currentCliVersion,
  nextVersion,
  parseChangelog,
  readRepoFile,
  releaseNotes,
  renderCut,
  unreleasedSection,
  writeRepoFile,
} from '../../../eslint-rules/cli-changelog-lib.mjs';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function computeNext() {
  const parsed = parseChangelog(readRepoFile(CHANGELOG_PATH));
  if (parsed.errors.length > 0) throw new Error(`${CHANGELOG_PATH}: ${parsed.errors.join('; ')}`);
  const kind = bumpKind(unreleasedSection(parsed));
  return kind ? nextVersion(currentCliVersion(), kind) : null;
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === 'next') {
    console.log(computeNext() ?? 'none');
    return;
  }
  if (command === 'cut') {
    const version = computeNext();
    if (!version) {
      console.error('Nothing to cut: Unreleased has no Breaking/Added/Fixed entries.');
      process.exitCode = 1;
      return;
    }
    const dateIndex = rest.indexOf('--date');
    const date = dateIndex !== -1 ? rest[dateIndex + 1] : today();
    writeRepoFile(CHANGELOG_PATH, renderCut(readRepoFile(CHANGELOG_PATH), version, date));
    bumpVersionStrings(version);
    console.log(version);
    return;
  }
  if (command === 'notes') {
    const version = rest[0];
    if (!version) throw new Error('notes: version required');
    const notes = releaseNotes(readRepoFile(CHANGELOG_PATH), version);
    if (!notes) {
      console.error(`No changelog section for ${version}.`);
      process.exitCode = 1;
      return;
    }
    console.log(notes);
    return;
  }
  console.error('usage: release.mjs next | cut [--date YYYY-MM-DD] | notes <version>');
  process.exitCode = 2;
}

main();
