import { describe, expect, it, vi } from 'vitest';
import {
  asDeliveryLogger,
  builderLabelFromRecord,
  DELIVERY_ACCEPTED_MSG,
  DELIVERY_GATE_VERDICT_MSG,
  DELIVERY_PREFLIGHT_REFUSED_MSG,
  failedStageFromProgress,
  logDeliveryAccepted,
  logDeliveryGateVerdict,
  logDeliveryPreflightRefused,
} from './delivery-metrics.js';

describe('delivery metrics', () => {
  it('emits stable refusal / accept / gate messages with closed labels', () => {
    const info = vi.fn();
    const log = { info };

    logDeliveryPreflightRefused(log, {
      issueNumber: 42,
      roundGeneration: 1,
      builder: 'managed',
      mode: 'preview',
      kind: 'symbols',
      attempt: 1,
    });
    logDeliveryAccepted(log, {
      issueNumber: 42,
      roundGeneration: 1,
      builder: 'managed',
      mode: 'preview',
      submitAttempts: 2,
      refusals: { audio: 0, symbols: 1, typecheck: 0 },
      msFromRoundStart: 12_000,
      typecheckBypass: false,
    });
    logDeliveryGateVerdict(log, {
      issueNumber: 42,
      roundGeneration: 1,
      builder: 'managed',
      mode: 'preview',
      outcome: 'failed',
      status: 'preview_failed',
      failedStage: 'typecheck',
    });

    expect(info.mock.calls.map((c) => c[1])).toEqual([
      DELIVERY_PREFLIGHT_REFUSED_MSG,
      DELIVERY_ACCEPTED_MSG,
      DELIVERY_GATE_VERDICT_MSG,
    ]);
    expect(info.mock.calls[0]![0]).toEqual({
      delivery: {
        issueNumber: 42,
        roundGeneration: 1,
        builder: 'managed',
        mode: 'preview',
        kind: 'symbols',
        attempt: 1,
      },
    });
    // Privacy: no slug, source, prompt, or uid.
    for (const [payload] of info.mock.calls) {
      const json = JSON.stringify(payload);
      expect(json).not.toMatch(/slug|prompt|uid|game\.ts|SPEC/);
    }
  });

  it('maps builders and failed stages to closed sets', () => {
    expect(builderLabelFromRecord('self')).toBe('self');
    expect(builderLabelFromRecord('platform')).toBe('platform');
    // Managed keeps builder=platform; backend wins.
    expect(builderLabelFromRecord('platform', 'managed:anthropic')).toBe('managed');
    expect(builderLabelFromRecord(undefined, 'managed:anthropic')).toBe('managed');
    // Self wins over a managed backend string.
    expect(builderLabelFromRecord('self', 'managed:anthropic')).toBe('self');
    expect(failedStageFromProgress('smoke')).toBe('smoke');
    expect(failedStageFromProgress('preparing')).toBe('other');
    expect(failedStageFromProgress(undefined)).toBeUndefined();
  });

  it('binds info to the logger receiver', () => {
    const calls: unknown[] = [];
    const log = {
      tag: 'pino-like',
      info(this: { tag: string }, context: object, message: string) {
        calls.push({ thisTag: this.tag, context, message });
      },
    };
    const bound = asDeliveryLogger(log);
    expect(bound).not.toBeNull();
    logDeliveryPreflightRefused(bound!, {
      issueNumber: 1,
      roundGeneration: 1,
      builder: 'platform',
      mode: 'publish',
      kind: 'audio',
      attempt: 1,
    });
    expect(calls).toEqual([
      {
        thisTag: 'pino-like',
        context: {
          delivery: {
            issueNumber: 1,
            roundGeneration: 1,
            builder: 'platform',
            mode: 'publish',
            kind: 'audio',
            attempt: 1,
          },
        },
        message: DELIVERY_PREFLIGHT_REFUSED_MSG,
      },
    ]);
  });
});
