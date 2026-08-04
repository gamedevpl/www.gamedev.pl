/**
 * Strict base64 decode — Node's `Buffer.from(s, 'base64')` ignores invalid characters,
 * so a truncated or corrupted payload like `YWJj!!!` silently becomes `abc`. Callers that
 * accept agent-supplied base64 must reject that class of damage before storing bytes.
 */

export class InvalidBase64Error extends Error {
  constructor(message = 'invalid base64') {
    super(message);
    this.name = 'InvalidBase64Error';
  }
}

/**
 * Decode standard base64 (whitespace allowed). Rejects non-canonical alphabet, bad
 * padding, and inputs Node would otherwise silently strip.
 */
export function decodeCanonicalBase64(raw: string): Buffer {
  const compact = raw.replace(/\s+/g, '');
  if (compact.length === 0) {
    throw new InvalidBase64Error('empty base64');
  }
  if (compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new InvalidBase64Error('invalid base64');
  }
  const bytes = Buffer.from(compact, 'base64');
  // Round-trip catches characters Node ignored and padding Node "fixed".
  if (bytes.toString('base64') !== compact) {
    throw new InvalidBase64Error('invalid base64');
  }
  return bytes;
}

export function decodeCanonicalBase64Utf8(raw: string): string {
  return decodeCanonicalBase64(raw).toString('utf8');
}
