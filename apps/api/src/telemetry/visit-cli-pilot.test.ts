import { describe, expect, it } from 'vitest';
import { summarizeCliPilot } from './visit-cli-pilot.js';
import { summarizeVisitFunnel } from './visit-funnel.js';
import type { VisitEvent } from '../platform/store.js';

function step(visitId: string, step: string, extra: Partial<VisitEvent> = {}): VisitEvent {
  return {
    visitId,
    type: 'cli_step',
    at: '2026-09-07T10:00:00.000Z',
    msSinceStart: 0,
    step,
    ...extra,
  } as VisitEvent;
}

describe('cli pilot read', () => {
  it('counts sessions per dimension, once each, however often a session repeats one', () => {
    const pilot = summarizeCliPilot([
      step('a', 'installed', { channel: 'curl', os: 'darwin' }),
      step('a', 'delegate_offered', { adapter: 'claude' }),
      step('a', 'delegate_offered', { adapter: 'claude' }),
      step('a', 'delegate_offered', { adapter: 'codex' }),
      step('a', 'delegate_used', { adapter: 'claude' }),
      step('a', 'verify_failed', { adapter: 'claude', stage: 'check_static' }),
      step('b', 'installed', { channel: 'update', os: 'darwin' }),
      step('b', 'delegate_offered', { adapter: 'claude' }),
      step('b', 'delivered'),
      step('b', 'published'),
    ]);
    expect(pilot.sessions).toBe(2);
    expect(pilot.delivered).toBe(1);
    expect(pilot.published).toBe(1);
    expect(pilot.adapters).toContainEqual({ adapter: 'claude', offered: 2, used: 1 });
    expect(pilot.adapters).toContainEqual({ adapter: 'codex', offered: 1, used: 0 });
    expect(pilot.verifyFailures).toContainEqual({ stage: 'check_static', sessions: 1 });
    expect(pilot.installs).toContainEqual({ channel: 'curl', sessions: 1 });
    expect(pilot.installs).toContainEqual({ channel: 'update', sessions: 1 });
    expect(pilot.platforms).toContainEqual({ os: 'darwin', sessions: 2 });
  });

  it('keeps every closed value present at zero, and names unknown only when it happened', () => {
    const quiet = summarizeCliPilot([step('a', 'first_turn')]);
    expect(quiet.platforms.map((row) => row.os)).toEqual(['linux', 'darwin', 'win32']);
    expect(quiet.installs.every((row) => row.sessions === 0)).toBe(true);
    expect(quiet.adapters.some((row) => row.adapter === 'unknown')).toBe(false);

    const older = summarizeCliPilot([step('b', 'installed'), step('b', 'delegate_used')]);
    expect(older.platforms.at(-1)).toEqual({ os: 'unknown', sessions: 1 });
    expect(older.installs.at(-1)).toEqual({ channel: 'unknown', sessions: 1 });
    expect(older.adapters.at(-1)).toEqual({ adapter: 'unknown', offered: 0, used: 1 });
  });

  // Visitors who never ran the CLI must not become pilot sessions.
  it('is empty, not zero-filled with visitors, when nobody ran the CLI', () => {
    const pilot = summarizeCliPilot([
      { visitId: 'w', type: 'visit_started', at: '2026-09-07T10:00:00.000Z', msSinceStart: 0, entry: 'home' },
      { visitId: 'w', type: 'play_started', at: '2026-09-07T10:00:01.000Z', msSinceStart: 1000 },
    ] as VisitEvent[]);
    expect(pilot).toMatchObject({ sessions: 0, delivered: 0, published: 0 });
  });

  it('travels on the funnel beside the rung counts', () => {
    const funnel = summarizeVisitFunnel([step('a', 'delivered'), step('a', 'published')]);
    expect(funnel.cli).toContainEqual({ step: 'published', visits: 1 });
    expect(funnel.cliPilot.published).toBe(1);
    expect(funnel.cliPilot.sessions).toBe(1);
  });
});
