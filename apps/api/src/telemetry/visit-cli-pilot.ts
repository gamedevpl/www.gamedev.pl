import {
  CLI_ADAPTERS,
  CLI_INSTALL_CHANNELS,
  CLI_PLATFORM_OS,
  CLI_VERIFY_STAGES,
  type CliAdapter,
  type CliInstallChannel,
  type CliPlatformOs,
  type CliVerifyStage,
} from '@gamedevpl/contract';
import type { VisitEvent } from '../platform/store.js';

// Dimensions CL-01 captured and nothing read, counted per CLI session.
export interface CliPilotRead {
  // Distinct CLI sessions that reported anything in the window.
  sessions: number;
  // Sessions that delivered sources, and sessions that watched a publish.
  delivered: number;
  published: number;
  adapters: Array<{ adapter: CliAdapter | 'unknown'; offered: number; used: number }>;
  verifyFailures: Array<{ stage: CliVerifyStage | 'unknown'; sessions: number }>;
  installs: Array<{ channel: CliInstallChannel | 'unknown'; sessions: number }>;
  platforms: Array<{ os: CliPlatformOs | 'unknown'; sessions: number }>;
}

type Buckets = Map<string, Set<string>>;

function mark(buckets: Buckets, key: string, visitId: string): void {
  const seen = buckets.get(key) ?? new Set<string>();
  seen.add(visitId);
  buckets.set(key, seen);
}

function count(buckets: Buckets, key: string): number {
  return buckets.get(key)?.size ?? 0;
}

// Closed values always, `unknown` only when a client predates the dimension.
function rows<Value extends string, Row>(
  values: readonly Value[],
  buckets: Buckets,
  prefix: string,
  row: (value: Value | 'unknown') => Row,
): Row[] {
  const known = values.map((value) => row(value));
  return count(buckets, `${prefix}:unknown`) > 0 ? [...known, row('unknown')] : known;
}

export function summarizeCliPilot(events: readonly VisitEvent[]): CliPilotRead {
  const sessions = new Set<string>();
  const buckets: Buckets = new Map();
  for (const event of events) {
    if (event.type !== 'cli_step' || !event.step) continue;
    sessions.add(event.visitId);
    mark(buckets, `step:${event.step}`, event.visitId);
    if (event.step === 'delegate_offered') mark(buckets, `offered:${event.adapter ?? 'unknown'}`, event.visitId);
    if (event.step === 'delegate_used') mark(buckets, `used:${event.adapter ?? 'unknown'}`, event.visitId);
    if (event.step === 'verify_failed') mark(buckets, `stage:${event.stage ?? 'unknown'}`, event.visitId);
    if (event.step === 'installed') {
      mark(buckets, `channel:${event.channel ?? 'unknown'}`, event.visitId);
      mark(buckets, `os:${event.os ?? 'unknown'}`, event.visitId);
    }
  }
  return {
    sessions: sessions.size,
    delivered: count(buckets, 'step:delivered'),
    published: count(buckets, 'step:published'),
    adapters: (() => {
      const named = CLI_ADAPTERS.map((adapter) => ({
        adapter: adapter as CliAdapter | 'unknown',
        offered: count(buckets, `offered:${adapter}`),
        used: count(buckets, `used:${adapter}`),
      }));
      const unknown = {
        adapter: 'unknown' as const,
        offered: count(buckets, 'offered:unknown'),
        used: count(buckets, 'used:unknown'),
      };
      return unknown.offered + unknown.used > 0 ? [...named, unknown] : named;
    })(),
    verifyFailures: rows(CLI_VERIFY_STAGES, buckets, 'stage', (stage) => ({
      stage,
      sessions: count(buckets, `stage:${stage}`),
    })),
    installs: rows(CLI_INSTALL_CHANNELS, buckets, 'channel', (channel) => ({
      channel,
      sessions: count(buckets, `channel:${channel}`),
    })),
    platforms: rows(CLI_PLATFORM_OS, buckets, 'os', (os) => ({
      os,
      sessions: count(buckets, `os:${os}`),
    })),
  };
}
