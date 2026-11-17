import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '../platform/store.js';
import { createSiteAssistantLimiter } from './site-assistant-limiter.js';

const NOON = Date.parse('2026-11-18T12:00:00Z');

function fixture(cap = 1000) {
  const store = new InMemoryStore();
  let at = NOON;
  const warnings: string[] = [];
  const limiter = createSiteAssistantLimiter({
    store,
    now: () => at,
    ttlMs: 0,
    defaultGlobalDailyCap: cap,
    logWarn: (_payload, message) => warnings.push(message),
  });
  return { store, limiter, warnings, setNow: (iso: string) => (at = Date.parse(iso)) };
}

describe('the site assistant limiter', () => {
  it('holds a call, then settles it to what the call used', async () => {
    const f = fixture();
    expect(await f.limiter.reserve('u', 600)).toEqual({ ok: true });
    expect(await f.store.getGlobalAssistantTokenCount('2026-11-18')).toBe(600);
    await f.limiter.spend('u', 150, 600);
    expect(await f.store.getGlobalAssistantTokenCount('2026-11-18')).toBe(150);
  });

  it('refuses a second call that would share the rest of the day', async () => {
    const f = fixture();
    expect((await f.limiter.reserve('a', 600)).ok).toBe(true);
    const refused = await f.limiter.reserve('b', 600);
    expect(refused).toEqual({ ok: false, resetsAt: Date.parse('2026-11-19T00:00:00Z') });
  });

  it('says there is no headroom once the cap is reached, until tomorrow', async () => {
    const f = fixture(500);
    expect(await f.limiter.check('u')).toEqual({ ok: true });
    await f.limiter.reserve('u', 500);
    expect(await f.limiter.check('u')).toEqual({ ok: false, resetsAt: Date.parse('2026-11-19T00:00:00Z') });
    f.setNow('2026-11-19T00:00:01Z');
    expect(await f.limiter.check('u')).toEqual({ ok: true });
  });

  it('obeys the pause and a cap the operator document sets', async () => {
    const f = fixture();
    await f.store.setCreationLimits({ globalDailyAssistantTokenCap: 100 }, 'test');
    expect((await f.limiter.reserve('u', 200)).ok).toBe(false);
    await f.store.setCreationLimits({ globalDailyAssistantTokenCap: null, assistantPaused: true }, 'test');
    expect(await f.limiter.paused()).toBe(true);
    expect(await f.limiter.check('u')).toEqual({ ok: false });
    expect(await f.limiter.reserve('u', 10)).toEqual({ ok: false });
    expect(await f.store.getGlobalAssistantTokenCount('2026-11-18')).toBe(0);
  });

  it('refuses rather than spend uncounted when the counter is unreachable', async () => {
    const f = fixture();
    f.store.checkAndIncrementGlobalAssistantTokens = async () => {
      throw new Error('firestore down');
    };
    f.store.getGlobalAssistantTokenCount = async () => {
      throw new Error('firestore down');
    };
    expect(await f.limiter.reserve('u', 10)).toEqual({ ok: false });
    expect(await f.limiter.check('u')).toEqual({ ok: false });
    expect(f.warnings.join(' ')).toContain('refusing the call');
  });

  it('refuses when the operator document was never readable', async () => {
    const f = fixture();
    f.store.getCreationLimits = async () => {
      throw new Error('firestore down');
    };
    expect(await f.limiter.reserve('u', 10)).toEqual({ ok: false });
    expect(await f.limiter.paused()).toBe(true);
  });

  it('settles a call that crossed midnight on the day that held it', async () => {
    const f = fixture();
    f.setNow('2026-11-18T23:59:59Z');
    await f.limiter.reserve('u', 600);
    f.setNow('2026-11-19T00:00:02Z');
    await f.limiter.spend('u', 150, 600);
    expect(await f.store.getGlobalAssistantTokenCount('2026-11-18')).toBe(150);
    expect(await f.store.getGlobalAssistantTokenCount('2026-11-19')).toBe(0);
  });
});
