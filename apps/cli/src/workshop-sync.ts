import type { SyncResult } from './checkout.js';
import { cliUsage } from './bin-name.js';

export function syncWarning(sync: SyncResult): string | null {
  if (sync.kind === 'platform_only') return `the platform is ahead (${sync.platform.join(', ')}) — /pull first`;
  if (sync.kind === 'conflict') return `conflict on ${sync.conflict.join(', ')} — /diff before editing`;
  if (sync.kind === 'legacy') return `no base version here — ${cliUsage('checkout', '<slug>')} again for a clean copy`;
  return null;
}
