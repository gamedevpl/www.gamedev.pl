// The unsub: prefix separates shared-key token types.

export {
  InvalidUnsubscribeTokenError,
  mintUnsubscribeToken,
  verifyUnsubscribeToken,
} from './unsubscribe-token-codec.js';
export type { UnsubscribeScope } from './unsubscribe-token-codec.js';

export function unsubscribeSecretFromEnv(): string | undefined {
  return process.env.UNSUBSCRIBE_SECRET ?? process.env.SESSION_SECRET;
}
