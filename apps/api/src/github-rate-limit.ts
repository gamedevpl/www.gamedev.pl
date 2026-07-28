/**
 * How a GitHub response announces that it was throttled.
 *
 * Its own module so the CI contract check can share it with the serving client
 * without pulling that client's bundler graph into a script that only reads two
 * files.
 */

/**
 * True for responses that indicate GitHub's rate limiting rather than a real,
 * permanent failure — a primary-limit 403 carries `x-ratelimit-remaining: 0`, a
 * secondary-limit 403 carries `Retry-After`, and 429 is always a limit. A bare 403
 * with neither header is a genuine permission problem and must not be retried.
 */
export function isRateLimitResponse(response: Response): boolean {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  return response.headers.get('retry-after') !== null || response.headers.get('x-ratelimit-remaining') === '0';
}
