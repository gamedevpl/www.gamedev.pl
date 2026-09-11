// Shared "how long ago was that?" formatting. The build feed and the my-games rail
// both live or die on a sense of time passing, and both must speak the creator's
// language — Intl does the localization so no locale keys are needed per unit.

const UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'year', ms: 365 * 24 * 3600_000 },
  { unit: 'month', ms: 30 * 24 * 3600_000 },
  { unit: 'day', ms: 24 * 3600_000 },
  { unit: 'hour', ms: 3600_000 },
  { unit: 'minute', ms: 60_000 },
];

/** "2 minutes ago" / "2 minuty temu". Anything under a minute is "just now". */
export function formatRelativeTime(timestamp: string | number, locale: string, now: number = Date.now()): string {
  const at = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(at)) return '';

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const deltaMs = at - now;
  const absMs = Math.abs(deltaMs);

  for (const { unit, ms } of UNITS) {
    if (absMs >= ms) {
      return formatter.format(Math.round(deltaMs / ms), unit);
    }
  }
  // Sub-minute: "now" reads better than "in 12 seconds" for a log line that
  // updates while you watch it.
  return formatter.format(0, 'second');
}

// "45s" / "1m 30s". Round the total first, else "1m 60s".
export function formatSeconds(seconds: number): string {
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

/** "4s" / "2m 14s" / "1h 03m" — a running clock, not a point in the past. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}
