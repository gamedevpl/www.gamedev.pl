import { describe, expect, it } from 'vitest';
import {
  bumpKind,
  bundledVersionIsDerived,
  CHANGELOG_PATH,
  cliSourceTouched,
  compareVersions,
  latestReleasedVersion,
  nextVersion,
  parseChangelog,
  readRepoFile,
  releaseNotes,
  renderCut,
  unreleasedSection,
  versionConsistency,
} from './cli-changelog-lib.mjs';

const sample = `# gamedevpl CLI changelog

Intro prose that must survive a cut.

## Unreleased

### Added

- A new verb (#10)
- Another one
  that wraps a line

### Fixed

- A crash (#11)

### Internal

- Refactor nobody sees

## 0.1.0 — 2026-09-04

First release.
`;

describe('parseChangelog', () => {
  it('reads sections, categories and wrapped entries', () => {
    const parsed = parseChangelog(sample);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sections.map((s) => s.version)).toEqual(['Unreleased', '0.1.0']);
    const unreleased = unreleasedSection(parsed);
    expect(unreleased.categories.Added).toEqual(['A new verb (#10)', 'Another one that wraps a line']);
    expect(unreleased.categories.Fixed).toEqual(['A crash (#11)']);
    expect(parsed.sections[1].date).toBe('2026-09-04');
  });

  it('flags unknown categories, orphan entries and a missing Unreleased', () => {
    const parsed = parseChangelog(`# x\n\n## 0.1.0 — 2026-01-01\n\n- orphan\n\n### Removed\n\n- nope\n`);
    expect(parsed.errors.join('\n')).toMatch(/outside a "### Category"/);
    expect(parsed.errors.join('\n')).toMatch(/unknown category "Removed"/);
    expect(parsed.errors.join('\n')).toMatch(/missing "## Unreleased"/);
  });

  it('flags a version header without a date', () => {
    const parsed = parseChangelog(`## Unreleased\n\n## 0.2.0\n`);
    expect(parsed.errors.join('\n')).toMatch(/0\.2\.0 has no date/);
  });
});

describe('bumpKind + nextVersion', () => {
  const section = (categories) => ({
    categories: { Breaking: [], Added: [], Fixed: [], Internal: [], ...categories },
  });

  it('picks the highest category present', () => {
    expect(bumpKind(section({ Fixed: ['x'] }))).toBe('patch');
    expect(bumpKind(section({ Fixed: ['x'], Added: ['y'] }))).toBe('minor');
    expect(bumpKind(section({ Added: ['y'], Breaking: ['z'] }))).toBe('major');
  });

  it('Internal alone never releases', () => {
    expect(bumpKind(section({ Internal: ['refactor'] }))).toBeNull();
    expect(nextVersion('0.1.0', null)).toBeNull();
  });

  it('bumps semver, and treats breaking as minor before 1.0', () => {
    expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1');
    expect(nextVersion('0.1.3', 'minor')).toBe('0.2.0');
    expect(nextVersion('0.4.2', 'major')).toBe('0.5.0');
    expect(nextVersion('1.4.2', 'major')).toBe('2.0.0');
    expect(nextVersion('1.4.2', 'minor')).toBe('1.5.0');
  });
});

describe('renderCut', () => {
  it('moves Unreleased under the version and leaves a fresh empty Unreleased', () => {
    const cut = renderCut(sample, '0.2.0', '2026-09-05');
    const parsed = parseChangelog(cut);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sections.map((s) => s.version)).toEqual(['Unreleased', '0.2.0', '0.1.0']);
    expect(bumpKind(unreleasedSection(parsed))).toBeNull();
    expect(parsed.sections[1].categories.Added).toHaveLength(2);
    expect(parsed.sections[1].categories.Internal).toEqual(['Refactor nobody sees']);
    expect(cut).toContain('Intro prose that must survive a cut.');
    expect(cut).toContain('First release.');
    expect(cut).not.toMatch(/\n{3,}/);
  });

  it('refuses a malformed changelog', () => {
    expect(() => renderCut('## 0.1.0\n', '0.2.0', '2026-01-01')).toThrow(/missing "## Unreleased"/);
  });
});

describe('releaseNotes', () => {
  it('renders categories without Internal', () => {
    const notes = releaseNotes(renderCut(sample, '0.2.0', '2026-09-05'), '0.2.0');
    expect(notes).toContain('### Added');
    expect(notes).toContain('- A crash (#11)');
    expect(notes).not.toContain('Internal');
  });

  it('falls back to prose for a hand-written section', () => {
    expect(releaseNotes(sample, '0.1.0')).toBe('First release.');
    expect(releaseNotes(sample, '9.9.9')).toBeNull();
  });
});

describe('cliSourceTouched', () => {
  it('counts shipped CLI code and adapters, not tests or docs', () => {
    expect(cliSourceTouched(['apps/cli/src/main.ts'])).toBe(true);
    expect(cliSourceTouched(['apps/cli/adapters.json'])).toBe(true);
    expect(cliSourceTouched(['apps/cli/scripts/build-binary.mjs'])).toBe(true);
    expect(cliSourceTouched(['apps/cli/src/main.test.ts'])).toBe(false);
    expect(cliSourceTouched(['apps/cli/README.md', 'apps/web/src/App.tsx'])).toBe(false);
  });
});

// Against the real files, not a fixture: this is the drift that shipped 0.1.0 from the
// installer while 0.3.0 was the newest release, found by hand on 2026-09-06.
describe('the repository own changelog', () => {
  const parsed = parseChangelog(readRepoFile(CHANGELOG_PATH));

  it('parses with no structural errors', () => {
    expect(parsed.errors).toEqual([]);
  });

  it('has exactly one Unreleased section, at the top', () => {
    expect(parsed.sections[0].version).toBe('Unreleased');
    expect(parsed.sections.filter((s) => s.version === 'Unreleased')).toHaveLength(1);
  });

  it('lists released versions newest first, each dated', () => {
    const released = parsed.sections.filter((s) => s.version !== 'Unreleased');
    expect(released.length).toBeGreaterThan(0);
    for (const section of released) expect(section.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (let i = 1; i < released.length; i += 1) {
      expect(compareVersions(released[i - 1].version, released[i].version)).toBeGreaterThan(0);
    }
  });

  it('agrees with package.json and the installer default', () => {
    const version = latestReleasedVersion(parsed);
    const state = versionConsistency();
    expect({ changelog: state.changelog, package: state.package, installer: state.installer }).toEqual({
      changelog: version,
      package: version,
      installer: version,
    });
    expect(state.ok).toBe(true);
  });

  // The version a creator sees came from a hand-kept constant, so every release printed
  // 0.1.0 whatever it was (screenshot, 2026-09-06). It is derived at build time now.
  it('does not let the CLI hardcode the version it prints', () => {
    expect(bundledVersionIsDerived()).toBe(true);
  });
});
