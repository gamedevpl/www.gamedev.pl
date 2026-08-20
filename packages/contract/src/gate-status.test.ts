import { describe, expect, it } from 'vitest';
import { deriveGateStatusString, derivePreviewGateStatus, GATE_STATUS_VALUES } from './gate-status.js';

describe('deriveGateStatusString', () => {
  it('green wins over any status', () => {
    expect(deriveGateStatusString({ green: true, status: 'kit_outdated' })).toBe('green');
    expect(deriveGateStatusString({ green: true })).toBe('green');
  });

  it('kit_outdated overrides preview_passed/preview_failed', () => {
    expect(deriveGateStatusString({ green: false, status: 'kit_outdated' })).toBe('kit_outdated');
  });

  it('passes through the preview statuses', () => {
    expect(deriveGateStatusString({ green: false, status: 'preview_passed' })).toBe('preview_passed');
    expect(deriveGateStatusString({ green: false, status: 'preview_failed' })).toBe('preview_failed');
  });

  it('defaults to red when not green and no status', () => {
    expect(deriveGateStatusString({ green: false })).toBe('red');
  });

  it('every possible return value is in GATE_STATUS_VALUES', () => {
    const cases: Array<Parameters<typeof deriveGateStatusString>[0]> = [
      { green: true },
      { green: false, status: 'kit_outdated' },
      { green: false, status: 'preview_passed' },
      { green: false, status: 'preview_failed' },
      { green: false },
    ];
    for (const c of cases) {
      expect(GATE_STATUS_VALUES).toContain(deriveGateStatusString(c));
    }
  });
});

describe('derivePreviewGateStatus', () => {
  it('kit_outdated overrides a passing preview', () => {
    expect(derivePreviewGateStatus({ green: true, status: 'kit_outdated' })).toBe('kit_outdated');
  });

  it('a passing preview is preview_passed, never green', () => {
    expect(derivePreviewGateStatus({ green: true })).toBe('preview_passed');
  });

  it('a failing preview is preview_failed', () => {
    expect(derivePreviewGateStatus({ green: false })).toBe('preview_failed');
  });
});
