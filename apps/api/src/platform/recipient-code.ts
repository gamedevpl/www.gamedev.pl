// GO-02 recipient discovery: addresses a user, not a credential.

import { randomBytes } from 'node:crypto';

const RECIPIENT_CODE_PREFIX = 'rc_';

// 128 random bits, base64url: unguessable and copy-paste safe.
export function generateRecipientCode(): string {
  return `${RECIPIENT_CODE_PREFIX}${randomBytes(16).toString('base64url')}`;
}

const RECIPIENT_CODE_PATTERN = /^rc_[A-Za-z0-9_-]{20,24}$/;

export function isRecipientCodeShape(code: string): boolean {
  return RECIPIENT_CODE_PATTERN.test(code);
}
