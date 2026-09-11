import { createHmac, timingSafeEqual } from 'node:crypto';

export class InvalidTokenError extends Error {
  constructor(message = 'invalid token') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

function signIssueNumber(jobId: number, secret: string): string {
  return createHmac('sha256', secret).update(String(jobId)).digest('hex');
}

export function mintToken(jobId: number, secret: string): string {
  const signature = signIssueNumber(jobId, secret);
  const payload = `${jobId}.${signature}`;
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

    const jobId = Number.parseInt(issueNumberRaw, 10);
    if (!Number.isSafeInteger(jobId) || jobId <= 0) {
      throw new InvalidTokenError();
    }

    const expected = signIssueNumber(jobId, secret);
    const actualBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      throw new InvalidTokenError();
    }

    return jobId;
  } catch (error) {
    if (error instanceof InvalidTokenError) {
      throw error;
    }
    throw new InvalidTokenError();
  }
}
