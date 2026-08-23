import { createHmac, timingSafeEqual } from 'node:crypto';

export class InvalidTokenError extends Error {
  constructor(message = 'invalid token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

function signIssueNumber(issueNumber: number, secret: string): string {
  return createHmac('sha256', secret).update(String(issueNumber)).digest('hex');
}

export function mintToken(issueNumber: number, secret: string): string {
  const signature = signIssueNumber(issueNumber, secret);
  const payload = `${issueNumber}.${signature}`;
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function verifyToken(token: string, secret: string): number {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split('.');
    if (parts.length !== 2) {
      throw new InvalidTokenError();
    }

    const [issueNumberRaw, signature] = parts;
    if (!issueNumberRaw || !signature || !/^\d+$/.test(issueNumberRaw) || !/^[a-f0-9]{64}$/i.test(signature)) {
      throw new InvalidTokenError();
    }

    const issueNumber = Number.parseInt(issueNumberRaw, 10);
    if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
      throw new InvalidTokenError();
    }

    const expected = signIssueNumber(issueNumber, secret);
    const actualBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new InvalidTokenError();
    }

    return issueNumber;
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      throw error;
    }
    throw new InvalidTokenError();
  }
}
