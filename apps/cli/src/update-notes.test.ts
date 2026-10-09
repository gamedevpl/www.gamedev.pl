import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fetchUpdateNotes, formatUpdateNotes, parseUpdateNotes } from './update-notes.js';

const changelog = `# CLI
## Unreleased
### Breaking
- Not shipped
## 0.30.0 — 2026-10-10
### Added
- Future feature
## 0.29.0 — 2026-10-10
### Breaking
- Foreground Play
  with Ctrl+C
### Internal
- Hidden refactor
## 0.28.0 — 2026-10-09
### Added
- Approval choices
## 0.27.2 — 2026-10-09
### Fixed
- Repair verification
## 0.27.1 — 2026-10-09
### Fixed
- Already installed
`;

describe('update release notes', () => {
  it('includes skipped releases, excludes old, future, unreleased and internal entries', async () => {
    const seen: string[] = [];
    const notes = await fetchUpdateNotes({
      previousVersion: '0.27.1',
      version: '0.29.0',
      fetchImpl: async (url) => {
        seen.push(url);
        return new Response(changelog);
      },
    });
    expect(seen).toEqual([
      'https://raw.githubusercontent.com/gamedevpl/www.gamedev.pl/cli-v0.29.0/apps/cli/CHANGELOG.md',
    ]);
    expect(notes.status).toBe('available');
    expect(notes.releases.map((release) => release.version)).toEqual(['0.29.0', '0.28.0', '0.27.2']);
    expect(notes.releases[0]?.changes).toEqual([{ category: 'Breaking', text: 'Foreground Play with Ctrl+C' }]);
    const output = formatUpdateNotes(notes);
    expect(output).toContain("What's new:");
    expect(output).toContain('Added: Approval choices');
    expect(output).toContain('Fixed: Repair verification');
    expect(output).not.toMatch(/Future|Hidden|Already installed|Not shipped/);
    expect(output).toContain('/blob/cli-v0.29.0/apps/cli/CHANGELOG.md');
  });

  it('parses the shipped changelog format, including numeric minor versions', () => {
    const text = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
    const releases = parseUpdateNotes(text, '0.27.0', '0.28.0');
    expect(releases.map((release) => release.version)).toEqual(['0.28.0', '0.27.2', '0.27.1']);
    expect(releases[0]?.changes.some((change) => change.text.includes('permission prompts'))).toBe(true);
    expect(parseUpdateNotes(changelog, '0.9.0', '0.29.0').map((release) => release.version)).toContain('0.27.1');
  });

  it('does not fetch or claim new changes when reinstalling the same version', async () => {
    const notes = await fetchUpdateNotes({
      previousVersion: '0.29.0',
      version: '0.29.0',
      fetchImpl: async () => {
        throw new Error('must not fetch');
      },
    });
    expect(notes.status).toBe('unchanged');
    expect(formatUpdateNotes(notes)).toBe('No version change.');
  });

  it.each(['0.30.0', '0.0.0-dev'])(
    'shows target notes for a downgrade or unknown previous version (%s)',
    async (previousVersion) => {
      const notes = await fetchUpdateNotes({
        previousVersion,
        version: '0.29.0',
        fetchImpl: async () => new Response(changelog),
      });
      expect(notes.scope).toBe('release');
      expect(notes.releases.map((release) => release.version)).toEqual(['0.29.0']);
      expect(formatUpdateNotes(notes)).toContain('Changes in this release:');
    },
  );

  it.each(['http', 'network', 'missing', 'oversized'])(
    'provides a changelog link when notes are unavailable (%s)',
    async (failure) => {
      const notes = await fetchUpdateNotes({
        previousVersion: '0.27.1',
        version: '0.29.0',
        fetchImpl: async () => {
          if (failure === 'network') throw new Error('offline');
          if (failure === 'http') return new Response('rate limited', { status: 429 });
          return new Response(failure === 'oversized' ? 'x'.repeat(200_001) : '## Unreleased\n### Added\n- Nope');
        },
      });
      expect(notes.status).toBe('unavailable');
      expect(formatUpdateNotes(notes)).toContain('Release notes unavailable. Changelog: https://github.com/');
    },
  );

  it('bounds the request including slow response bodies', async () => {
    const notes = await fetchUpdateNotes({
      previousVersion: '0.27.1',
      version: '0.29.0',
      fetchImpl: async (_url, init) => {
        const signal = init?.signal;
        expect(signal).toBeInstanceOf(AbortSignal);
        return new Response(
          new ReadableStream({
            start(controller) {
              signal?.addEventListener('abort', () => controller.error(signal.reason), { once: true });
            },
          }),
        );
      },
    });
    expect(notes.status).toBe('unavailable');
  });

  it('sanitizes terminal controls and wraps long changes on narrow terminals', async () => {
    const notes = await fetchUpdateNotes({
      previousVersion: '0.27.1',
      version: '0.29.0',
      fetchImpl: async () =>
        new Response('## 0.29.0\n### Fixed\n- `play` \u001b[31mred\u001b[0m\u0007\u202elong words for a narrow screen'),
    });
    const output = formatUpdateNotes(notes, 25);
    for (const control of ['\u001b', '\u0007', '\u202e', '`']) expect(output).not.toContain(control);
    expect(
      output
        .split('\n')
        .filter((line) => !line.startsWith('Changelog:'))
        .every((line) => line.length <= 25),
    ).toBe(true);
  });
});
