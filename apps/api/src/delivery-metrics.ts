// Delivery preflight + gate metrics (stable log messages).

import type { GateStatus } from '@gamedevpl/contract';

export type DeliveryGateStatus = GateStatus;

export const DELIVERY_PREFLIGHT_REFUSED_MSG = 'delivery preflight refused';
export const DELIVERY_ACCEPTED_MSG = 'delivery accepted';
export const DELIVERY_GATE_VERDICT_MSG = 'delivery gate verdict';

export type DeliveryPreflightKind = 'audio' | 'symbols' | 'typecheck' | 'any-type';
export type DeliveryBuilderLabel = 'platform' | 'self' | 'managed' | 'other';
export type DeliveryModeLabel = 'preview' | 'publish';

export type DeliveryFailedStage = 'typecheck' | 'smoke' | 'build' | 'trace' | 'capture' | 'validate' | 'other';

interface Logger {
  info: (context: object, message: string) => void;
}

export function builderLabelFromRecord(builder: string | undefined, backend?: string): DeliveryBuilderLabel {
  // Managed keeps builder=platform; prefer managed:* backend.
  if (builder === 'self') return 'self';
  if (backend?.startsWith('managed:')) return 'managed';
  if (builder === 'platform') return 'platform';
  if (builder) return 'other';
  return 'other';
}

// Bind info so Pino keeps its receiver.
export function asDeliveryLogger(log: { info?: (context: object, message: string) => void }): Logger | null {
  if (typeof log.info !== 'function') return null;
  return { info: log.info.bind(log) };
}

export function logDeliveryPreflightRefused(
  log: Logger,
  input: {
    issueNumber: number;
    roundGeneration: number;
    builder: DeliveryBuilderLabel;
    mode: DeliveryModeLabel;
    kind: DeliveryPreflightKind;
    attempt: number;
  },
): void {
  log.info(
    {
      delivery: {
        issueNumber: input.issueNumber,
        roundGeneration: input.roundGeneration,
        builder: input.builder,
        mode: input.mode,
        kind: input.kind,
        attempt: input.attempt,
      },
    },
    DELIVERY_PREFLIGHT_REFUSED_MSG,
  );
}

export function logDeliveryAccepted(
  log: Logger,
  input: {
    issueNumber: number;
    roundGeneration: number;
    builder: DeliveryBuilderLabel;
    mode: DeliveryModeLabel;
    submitAttempts: number;
    refusals: { audio: number; symbols: number; typecheck: number };
    msFromRoundStart: number | null;
    typecheckBypass: boolean;
  },
): void {
  log.info(
    {
      delivery: {
        issueNumber: input.issueNumber,
        roundGeneration: input.roundGeneration,
        builder: input.builder,
        mode: input.mode,
        submitAttempts: input.submitAttempts,
        refusals: input.refusals,
        msFromRoundStart: input.msFromRoundStart,
        typecheckBypass: input.typecheckBypass,
      },
    },
    DELIVERY_ACCEPTED_MSG,
  );
}

export function logDeliveryGateVerdict(
  log: Logger,
  input: {
    issueNumber: number;
    roundGeneration: number;
    builder: DeliveryBuilderLabel;
    mode: DeliveryModeLabel;
    outcome: 'passed' | 'failed';
    status: DeliveryGateStatus;
    failedStage?: DeliveryFailedStage;
  },
): void {
  log.info(
    {
      delivery: {
        issueNumber: input.issueNumber,
        roundGeneration: input.roundGeneration,
        builder: input.builder,
        mode: input.mode,
        outcome: input.outcome,
        status: input.status,
        ...(input.failedStage ? { failedStage: input.failedStage } : {}),
      },
    },
    DELIVERY_GATE_VERDICT_MSG,
  );
}

// Map progress stage to a closed failed-stage label.
export function failedStageFromProgress(stage: string | undefined): DeliveryFailedStage | undefined {
  if (!stage) return undefined;
  if (stage === 'typecheck' || stage === 'smoke' || stage === 'build') return stage;
  if (stage === 'trace' || stage === 'capture' || stage === 'validate') return stage;
  return 'other';
}
