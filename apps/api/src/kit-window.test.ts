import { describe, expect, it } from 'vitest';
import { isKitEngineRefSupported, kitOutdatedReport, parseKitRegistry, type KitRegistry } from './kit-window.js';

const REGISTRY: KitRegistry = {
  current: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  previous: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  updatedAt: '2026-07-31T12:00:00.000Z',
};

describe('kit window (kits/current.json)', () => {
  it('parses the registry document', () => {
    expect(parseKitRegistry(JSON.stringify(REGISTRY))).toEqual(REGISTRY);
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
    expect(report).toMatch(/get_kit|Refresh the Creator Kit/i);
  });
});
