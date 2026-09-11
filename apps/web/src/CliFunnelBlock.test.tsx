// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { CliFunnelBlock } from './CliFunnelBlock.js';
import type { VisitFunnel } from './healthApi.js';

// A launch decision is read off this block, so labels matter.
function render(funnel: Partial<VisitFunnel>): string {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(createElement(CliFunnelBlock, { funnel: funnel as VisitFunnel }));
  });
  const text = host.textContent ?? '';
  act(() => {
    root.unmount();
  });
  host.remove();
  return text;
}

function response(overrides: Partial<VisitFunnel>): Partial<VisitFunnel> {
  return overrides;
}

describe('CliFunnelBlock', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });
  const rungs = (over: Record<string, number> = {}) =>
    [
      'installed',
      'authorized',
      'first_turn',
      'build_requested',
      'delivered',
      'published',
      'play_requested',
      'delegate_offered',
      'delegate_used',
      'verify_failed',
    ].map((step) => ({ step, visits: over[step] ?? 0 }));

  const pilot = (over: Partial<NonNullable<VisitFunnel['cliPilot']>> = {}) => ({
    sessions: 4,
    delivered: 0,
    published: 0,
    adapters: [{ adapter: 'claude', offered: 3, used: 1 }],
    verifyFailures: [{ stage: 'check_static', sessions: 0 }],
    installs: [{ channel: 'curl', sessions: 0 }],
    platforms: [{ os: 'darwin', sessions: 0 }],
    ...over,
  });

  it('answers the pilot question with the publish count, not an inference', () => {
    const text = render(
      response({
        cli: rungs({ installed: 4, authorized: 3, delivered: 2, published: 1 }),
        cliPilot: pilot({ delivered: 2, published: 1 }),
      }),
    );
    expect(text).toContain('Does anyone finish a game this way?');
    expect(text).toContain('1 session of 4 watched a game publish');
    expect(text).toContain('2 delivered sources');
  });

  // Delivered but never published is the honest middle state.
  it('does not call delivery a finish', () => {
    const text = render(response({ cli: rungs({ installed: 3, delivered: 2 }), cliPilot: pilot({ delivered: 2 }) }));
    expect(text).toContain('Nobody has published this way yet');
    expect(text).not.toContain('watched a game publish');
  });

  it('names each run a session, so the rungs are not read as one creator', () => {
    const text = render(response({ cli: rungs({ installed: 2 }), cliPilot: pilot({ sessions: 2 }) }));
    expect(text).toContain('Every gamedevpl run is its own session');
  });

  it('shows take-up per agent and where the ladder broke', () => {
    const text = render(
      response({
        cli: rungs({ delegate_offered: 3, delegate_used: 1, verify_failed: 1 }),
        cliPilot: pilot({
          adapters: [
            { adapter: 'claude', offered: 3, used: 1 },
            { adapter: 'codex', offered: 0, used: 0 },
          ],
          verifyFailures: [{ stage: 'check_static', sessions: 1 }],
          installs: [{ channel: 'curl', sessions: 2 }],
          platforms: [{ os: 'darwin', sessions: 2 }],
        }),
      }),
    );
    expect(text).toContain('claude');
    expect(text).toContain('33%');
    expect(text).not.toContain('codex');
    expect(text).toContain('check:static 1');
    expect(text).toContain('curl | sh 2');
    expect(text).toContain('macOS 2');
  });

  it('renders the rungs for a client that predates the pilot read', () => {
    const text = render(response({ cli: rungs({ installed: 2, authorized: 1 }), cliPilot: undefined }));
    expect(text).toContain('signed in');
    expect(text).toContain('50%');
    expect(text).not.toContain('Does anyone finish');
  });

  it('refuses to invent a verdict from an empty window', () => {
    const text = render(response({ cli: rungs(), cliPilot: pilot({ sessions: 0 }) }));
    expect(text).toContain('Nobody used the gamedevpl CLI in this window');
    expect(text).not.toContain('Does anyone finish');
  });
});
