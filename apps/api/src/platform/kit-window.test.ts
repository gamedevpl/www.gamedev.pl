import { describe, expect, it } from 'vitest';
import {
  isKitEngineRefSupported,
  kitOutdatedReport,
  parseKitRegistry,
  semverMajor,
  type KitRegistry,
} from './kit-window.js';

const REGISTRY: KitRegistry = {
  current: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  previous: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  updatedAt: '2026-07-31T12:00:00.000Z',
};

describe('kit window (kits/current.json)', () => {
  it('parses the registry document', () => {
    expect(parseKitRegistry(JSON.stringify(REGISTRY))).toEqual(REGISTRY);
  });

  it('rejects an empty-string previous (null is the only “no previous”)', () => {
    expect(() => parseKitRegistry(JSON.stringify({ ...REGISTRY, previous: '' }))).toThrow(/previous/);
  });

  it('accepts current and previous, refuses everything else', () => {
    expect(isKitEngineRefSupported(REGISTRY.current, REGISTRY)).toBe(true);
    expect(isKitEngineRefSupported(REGISTRY.previous!, REGISTRY)).toBe(true);
    expect(isKitEngineRefSupported('cccccccccccccccccccccccccccccccccccccccc', REGISTRY)).toBe(false);
    expect(isKitEngineRefSupported('', REGISTRY)).toBe(false);
  });

  it('treats a null previous as a single-ref window', () => {
    const onlyCurrent: KitRegistry = { ...REGISTRY, previous: null };
    expect(isKitEngineRefSupported(onlyCurrent.current, onlyCurrent)).toBe(true);
    expect(isKitEngineRefSupported(REGISTRY.previous!, onlyCurrent)).toBe(false);
  });

  it('never invents a window from ancestry — only exact registry membership', () => {
    // A parent of `current` that is not recorded as `previous` is outside the window.
    // The packer is path-filtered; git parents are not the authority.
    expect(isKitEngineRefSupported('dddddddddddddddddddddddddddddddddddddddd', REGISTRY)).toBe(false);
  });

  it('names the refresh action in the kit_outdated report', () => {
    const report = kitOutdatedReport('cccccccccccccccccccccccccccccccccccccccc', REGISTRY);
    expect(report).toMatch(/^kit_outdated:/);
    expect(report).toContain('cccccccccccccccccccccccccccccccccccccccc');
    expect(report).toContain(REGISTRY.current);
    expect(report).toContain(REGISTRY.previous!);
    expect(report).toMatch(/get_kit/i);
    expect(report).toMatch(/fromLatestDelivery/);
    expect(report).toMatch(/do not re-stage|do not re-upload/i);
  });

  describe('semver window (compatibility, not commit count)', () => {
    // The day that produced this rule: seven kits in ten hours, so a get_kit answer was
    // good for 45–90 minutes and three consecutive rounds were refused for age. Almost
    // none of those merges could have broken a game — one merely added a probe script.
    const VERSIONED: KitRegistry = {
      current: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      previous: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      currentVersion: '1.4.2',
      updatedAt: '2026-08-05T11:48:00.000Z',
    };
    const OLD = 'cccccccccccccccccccccccccccccccccccccccc';

    it('accepts a ref that fell out of N/N−1 only because we merged', () => {
      // Two generations back, same major: nothing about it could have broken.
      expect(isKitEngineRefSupported(OLD, VERSIONED, '1.0.0')).toBe(true);
      expect(isKitEngineRefSupported(OLD, VERSIONED, '1.4.1')).toBe(true);
      // Age is irrelevant now — only the contract is.
      expect(isKitEngineRefSupported(OLD, VERSIONED, '1.0.0-rc.1')).toBe(true);
    });

    it('refuses a delivery from a different major, which is what a break looks like', () => {
      expect(isKitEngineRefSupported(OLD, VERSIONED, '0.9.9')).toBe(false);
      // Newer major means the engine was rolled back and those APIs are gone.
      expect(isKitEngineRefSupported(OLD, VERSIONED, '2.0.0')).toBe(false);
    });

    it('falls back to N/N−1 when either side is unversioned', () => {
      // Old publisher, new API — and new publisher, kit packed before versioning.
      // Both must behave exactly as they did before this existed.
      expect(isKitEngineRefSupported(OLD, VERSIONED, null)).toBe(false);
      expect(isKitEngineRefSupported(OLD, VERSIONED, 'not-a-semver')).toBe(false);
      expect(isKitEngineRefSupported(OLD, REGISTRY, '1.0.0')).toBe(false);
      // ...and the floor still stands in both cases.
      expect(isKitEngineRefSupported(VERSIONED.current, VERSIONED, null)).toBe(true);
      expect(isKitEngineRefSupported(VERSIONED.previous!, VERSIONED, null)).toBe(true);
    });

    it('never narrows: current and previous pass with no version at all', () => {
      const noVersion: KitRegistry = { ...VERSIONED, currentVersion: undefined };
      expect(isKitEngineRefSupported(noVersion.current, noVersion)).toBe(true);
      expect(isKitEngineRefSupported(noVersion.previous!, noVersion)).toBe(true);
    });

    it('parses a semver major, and refuses to guess at anything else', () => {
      expect(semverMajor('1.4.2')).toBe(1);
      expect(semverMajor('12.0.0')).toBe(12);
      expect(semverMajor('2.0.0-rc.1')).toBe(2);
      expect(semverMajor('2.0.0+build.5')).toBe(2);
      expect(semverMajor(' 1.0.0 ')).toBe(1);
      for (const bad of ['1.4', '1', 'v1.4.2', '', 'latest', null, undefined]) {
        expect(semverMajor(bad)).toBeNull();
      }
    });

    it('drops a malformed currentVersion instead of taking the whole registry down', () => {
      // The trap: the gate reads this registry through `.catch(() => null)`, and a null
      // registry SKIPS the kit check entirely. Throwing here would not refuse a corrupt
      // document — it would wave every delivery through, including a different major.
      // Degrading to N/N−1 is the narrow answer; throwing was the wide one.
      for (const bad of ['', 7, '1.4', 'v1.4.2', null, {}]) {
        const parsed = parseKitRegistry(JSON.stringify({ ...VERSIONED, currentVersion: bad }));
        expect(parsed.currentVersion).toBeUndefined();
        // ...and with no version to compare, the old floor is what remains.
        expect(isKitEngineRefSupported(OLD, parsed, '1.0.0')).toBe(false);
        expect(isKitEngineRefSupported(parsed.current, parsed)).toBe(true);
      }
      expect(parseKitRegistry(JSON.stringify(VERSIONED)).currentVersion).toBe('1.4.2');
    });

    it('tells the agent the rule, not two opaque SHAs', () => {
      const report = kitOutdatedReport(OLD, VERSIONED);
      expect(report).toContain('current kit is v1.4.2');
      expect(report).toContain('share its major version');
      // Unversioned registries keep the old wording — there is no major to share.
      expect(kitOutdatedReport(OLD, REGISTRY)).toContain(REGISTRY.current);
      expect(kitOutdatedReport(OLD, REGISTRY)).not.toContain('major version');
    });
  });
});
