/**
 * Pulls a Bearer credential out of an Authorization header without a regex.
 * The naive `/^Bearer\s+(.+)$/i` form is quadratic on long runs of spaces
 * (CodeQL js/polynomial-redos), and these headers are attacker-controlled.
 */
export function readBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (trimmed.length < 7) return null;
  if (trimmed.slice(0, 6).toLowerCase() !== 'bearer') return null;
  const sep = trimmed.charAt(6);
  if (sep !== ' ' && sep !== '\t') return null;
  let i = 7;
  while (i < trimmed.length && (trimmed.charAt(i) === ' ' || trimmed.charAt(i) === '\t')) {
    i += 1;
  }
  const token = trimmed.slice(i).trim();
  return token || null;
}
