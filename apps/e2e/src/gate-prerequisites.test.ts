import { describe, expect, it } from 'vitest';
import { e2ePrerequisites } from './browser.js';

/**
 * A gate that can silently skip is not a gate.
 *
 * Every other suite here is `describe.skipIf(!prereq.ok)`, which is right locally — a
 * contributor without a token should not get failures they cannot act on. But that same
 * behaviour, running as a deploy gate, produces the worst possible outcome: a missing
 * token or an unresolvable browser makes the whole suite skip, the job exits 0, and the
 * deploy promotes having verified nothing. Green, and meaningless.
 *
 * This file deliberately does **not** skip. When `E2E_REQUIRED=1` — which
 * `.github/workflows/deploy.yml` sets — an unusable environment is a hard failure that
 * stops promotion, in exactly the situation where absence of signal would otherwise be
 * mistaken for a pass.
 *
 * The failure this was written for: `findChromium()` searches `PLAYWRIGHT_BROWSERS_PATH`
 * (default `/opt/pw-browsers`), while `npx playwright install` on a GitHub runner writes
 * to `~/.cache/ms-playwright`. Without the workflow pinning that variable, the browser is
 * installed somewhere the suite never looks, everything skips, and the gate is decorative.
 */
describe('deploy gate prerequisites', () => {
  it('can actually run when the environment claims to be gating', () => {
    if (process.env.E2E_REQUIRED !== '1') {
      // Local run: skipping is legitimate and the other suites explain themselves.
      expect(true).toBe(true);
      return;
    }

    const prereq = e2ePrerequisites();
    expect(
      prereq.ok,
      `E2E_REQUIRED=1 but this suite cannot run: ${prereq.reason}. ` +
        'The gate would have skipped and let the deploy promote unverified.',
    ).toBe(true);
  });
});
