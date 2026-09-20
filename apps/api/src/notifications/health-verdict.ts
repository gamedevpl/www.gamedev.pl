// Pure: a health verdict in, a stored patch and alert id out.
import type { PublicationHealthCheck } from '../delivery/games-store.js';
import { RED_RECHECK_COOLDOWN_MS } from '../platform/sweep-cadence.js';

export type HealthVerdictOutcome =
  | { green: true; patch: PublicationHealthCheck }
  | { green: false; patch: PublicationHealthCheck; unhealthySinceAt: string; alertId: string };

export function resolveHealthVerdict(
  slug: string,
  check: PublicationHealthCheck,
  health: { green: boolean; ranAt: string },
): HealthVerdictOutcome {
  if (health.green) {
    // Recovered: drop the streak, so a relapse reads as a fresh problem.
    const { unhealthySinceAt: _dropped, ...recovered } = check;
    return { green: true, patch: { ...recovered, green: true, verdictAt: health.ranAt } };
  }

  // First red verdict starts the streak; later re-checks carry it forward.
  const unhealthySinceAt = check.unhealthySinceAt ?? health.ranAt;
  const streakWindow = Math.floor((Date.parse(health.ranAt) - Date.parse(unhealthySinceAt)) / RED_RECHECK_COOLDOWN_MS);
  return {
    green: false,
    patch: { ...check, green: false, verdictAt: health.ranAt, unhealthySinceAt },
    unhealthySinceAt,
    alertId: `op-health-${slug}-${check.version}-${streakWindow}`,
  };
}
