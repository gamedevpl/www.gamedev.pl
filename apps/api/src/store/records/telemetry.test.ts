import { describe, expect, it } from 'vitest';
import { TELEMETRY_COLLECTION, TELEMETRY_RETENTION_DAYS, telemetryExpiresAt } from './telemetry.js';

/**
 * Retention is enforced by a Firestore TTL policy applied out-of-band, so what can be
 * tested here is the part the policy depends on: the deadline the writer stamps, and the
 * names the policy has to be pointed at.
 */
describe('telemetry retention', () => {
  it('dates the deadline from the event, not from when it was written', () => {
    const at = '2026-07-25T10:04:39.669Z';
    const expiry = telemetryExpiresAt(at);

    // A late flush back-dates `at` by up to six hours; retention counts from the play,
    // so a back-dated event expires earlier than one received at the same moment.
    expect(expiry.toISOString()).toBe('2026-10-23T10:04:39.669Z');
    expect(expiry.getTime() - Date.parse(at)).toBe(TELEMETRY_RETENTION_DAYS * 86_400_000);
  });

  it('never yields an immortal row for an unparseable timestamp', () => {
    const before = Date.now();
    const expiry = telemetryExpiresAt('not a timestamp');

    const window = TELEMETRY_RETENTION_DAYS * 86_400_000;
    expect(expiry.getTime()).toBeGreaterThanOrEqual(before + window);
    expect(expiry.getTime()).toBeLessThanOrEqual(Date.now() + window);
  });

  it('keeps play data out of the collection group that holds build history', () => {
    // A TTL policy is scoped to a collection group. Sharing `events` with
    // `submissions/{n}/events` would put one retention rule over both.
    expect(TELEMETRY_COLLECTION).not.toBe('events');
  });
});
