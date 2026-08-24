import { selfBuildDeliveryCap } from '../creation/builder.js';
import {
  asDeliveryLogger,
  builderLabelFromRecord,
  logDeliveryAccepted,
  logDeliveryPreflightRefused,
} from '../platform/delivery-metrics.js';
import { InvalidUploadError, type GamesStore, type SourceFile } from './games-store.js';
import { parseSpecTitle } from '../catalog/github-client.js';
import {
  canTransition,
  resolveJobState,
  TERMINAL_JOB_STATES,
  type JobState,
  type TransitionActor,
} from '../creation/job-state.js';
import type { KitFileStore } from '../agent-surface/kit-files.js';
import { normalizeAtIntake } from '../platform/localize-intake.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import { createTranslatorFromEnv, type Translator } from '../platform/translate.js';
import {
  runTypecheckPreflight,
  sharedSourcesFromKitTree,
  TYPECHECK_PREFLIGHT_MAX_REFUSALS,
} from '../creation/typecheck-preflight.js';
import type { StagedPreviewPublisher } from './staged-preview.js';

export interface SourceDeliveryAuthority {
  backend: string; // Backend identity recorded at dispatch time.
  // Vendor session that produced these files.
  sessionRef: string;
  // Round generation captured when that session started.
  roundGeneration: number;
}

export interface SourceDeliveryInput {
  issueNumber: number;
  slug: string;
  files: SourceFile[];
  mode: 'preview' | 'publish';
  backend?: string;
  kitEngineRef?: string;
  // Channel may bind a legacy slug; managed harvest may not.
  bindSlug?: boolean;
  authority?: SourceDeliveryAuthority;
  /** Who wrote this delivery — see {@link VersionManifest.authorship} (CE-20). */
  authorship?: 'agent' | 'owner' | 'mixed';
  summary?: string;
  /** Who *called this route* — distinct from `authorship`'s file-level provenance.
   * Drives the `by` field on the job transitions this delivery records. Defaults to
   * `'agent'` (the agent channel and managed-harvest callers never set this); the Code
   * surface's manual delivery route is the one caller that passes `'creator'`. */
  actor?: 'agent' | 'creator';
}

export interface SourceDeliveryAccepted {
  accepted: true;
  slug: string;
  version: string;
  mode: 'preview' | 'publish';
  gateStarted: boolean;
  buildId?: string;
}

export type SourceDeliveryRejected = {
  accepted: false;
  rejected: 'stopped' | 'rate_limited' | 'delivery_cap';
  deliveryCap?: number;
  deliveriesUsed?: number;
};

export type SourceDeliveryOutcome = SourceDeliveryAccepted | SourceDeliveryRejected;

export class SourceDeliveryAuthorityError extends Error {
  readonly reason:
    | 'job_not_found'
    | 'slug_mismatch'
    | 'backend_mismatch'
    | 'session_mismatch'
    | 'round_generation_mismatch'
    | 'round_closed'
    | 'round_handed_off';

  constructor(reason: SourceDeliveryAuthorityError['reason'], message: string) {
    super(message);
    this.name = 'SourceDeliveryAuthorityError';
    this.reason = reason;
  }
}

export class SourceDeliveryValidationError extends InvalidUploadError {
  readonly reason: 'kit_engine_ref_required' | 'kit_engine_ref_mismatch';

  constructor(reason: SourceDeliveryValidationError['reason'], message: string) {
    super(message);
    this.name = 'SourceDeliveryValidationError';
    this.reason = reason;
  }
}

export interface SourceDeliveryService {
  deliver(input: SourceDeliveryInput): Promise<SourceDeliveryOutcome>;
}

export interface SourceDeliveryServiceOptions {
  store: Store;
  gamesStore: GamesStore;
  // Optional: typecheck against the round's pinned kit.
  kitFileStore?: KitFileStore | null;
  stagedPreviews?: Pick<StagedPreviewPublisher, 'publishCandidate'> | null;
  now?: () => number;
  maxSubmitsPerWindow?: number;
  onSourcesDelivered?: (input: {
    issueNumber: number;
    slug: string;
    version: string;
    mode?: 'health' | 'preview' | 'proposal';
  }) => Promise<{ buildId?: string; accepted?: boolean } | void> | void;
  onEvent?: (issueNumber: number) => void;
  log?: {
    info?: (context: object, message: string) => void;
    error: (context: object, message: string) => void;
    warn?: (context: object, message: string) => void;
  };
  // Same lazy-default pattern as agent-channel.ts / submissions.ts.
  translator?: Translator;
}

const DEFAULT_MAX_SUBMITS_PER_WINDOW = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

// Matches agent-channel.ts's MAX_EVENT_TEXT — same field, same reader, same cap.
const MAX_DELIVERY_EVENT_TEXT = 300;

// Posts a thread event via the same localization pass agent events get.
async function reportDeliveryEvent(
  store: Store,
  translator: Translator,
  issueNumber: number,
  kind: 'blocked' | 'milestone',
  rawText: string,
): Promise<void> {
  const clean = sanitizeCreatorText(rawText, { singleLine: true }).slice(0, MAX_DELIVERY_EVENT_TEXT);
  const intake = await normalizeAtIntake(translator, clean, { kind: 'log', maxLength: MAX_DELIVERY_EVENT_TEXT });
  await store.appendBuildEvent(
    issueNumber,
    {
      kind,
      text: intake.text,
      ...(intake.textLocalized && intake.locale ? { textLocalized: intake.textLocalized, locale: intake.locale } : {}),
    },
    // A system notice about this delivery, not proof the agent itself resumed.
    { preserveEnded: true },
  );
}

function stopReason(record: SubmissionRecord): 'stopped' | null {
  if (record.abandonedAt || record.publishedAt || resolveJobState(record) === 'canceled') return 'stopped';
  if (record.builderHandoff && record.builderHandoff.awaitsAgentAck !== false) return 'stopped';
  return null;
}

function currentState(record: SubmissionRecord): JobState {
  return (record.state ?? 'queued') as JobState;
}

function managedAuthorityError(
  record: SubmissionRecord,
  input: SourceDeliveryInput,
  authority: SourceDeliveryAuthority,
): SourceDeliveryAuthorityError | null {
  if (!record.slug || record.slug !== input.slug) {
    return new SourceDeliveryAuthorityError(
      'slug_mismatch',
      `managed delivery is for ${record.slug ?? 'the job slug'}, not ${input.slug}`,
    );
  }
  if (record.dispatch?.backend !== authority.backend) {
    return new SourceDeliveryAuthorityError(
      'backend_mismatch',
      `managed delivery backend ${authority.backend} is not current for this job`,
    );
  }
  const currentSessionRef = record.dispatch.refs[record.dispatch.refs.length - 1];
  if (currentSessionRef !== authority.sessionRef) {
    return new SourceDeliveryAuthorityError(
      'session_mismatch',
      'managed delivery came from a superseded agent session',
    );
  }
  const currentGeneration = record.roundGeneration ?? 1;
  if (currentGeneration !== authority.roundGeneration) {
    return new SourceDeliveryAuthorityError(
      'round_generation_mismatch',
      `managed delivery is for round ${authority.roundGeneration}, but round ${currentGeneration} is current`,
    );
  }
  if (record.builderHandoff && record.builderHandoff.awaitsAgentAck !== false) {
    return new SourceDeliveryAuthorityError(
      'round_handed_off',
      'managed delivery arrived after builder handoff was requested',
    );
  }
  const resolvedState = resolveJobState(record);
  if (resolvedState && TERMINAL_JOB_STATES.has(resolvedState)) {
    return new SourceDeliveryAuthorityError('round_closed', 'managed delivery arrived after the build round closed');
  }
  return null;
}

export function createSourceDeliveryService(options: SourceDeliveryServiceOptions): SourceDeliveryService {
  const now = options.now ?? Date.now;
  const translator = options.translator ?? createTranslatorFromEnv();
  const maxSubmitsPerWindow = options.maxSubmitsPerWindow ?? DEFAULT_MAX_SUBMITS_PER_WINDOW;
  const submitsByBuild = new Map<number, number[]>();

  function isRateLimited(issueNumber: number): boolean {
    const currentTime = now();
    const hits = (submitsByBuild.get(issueNumber) ?? []).filter(
      (timestamp) => currentTime - timestamp < RATE_LIMIT_WINDOW_MS,
    );
    if (hits.length >= maxSubmitsPerWindow) {
      submitsByBuild.set(issueNumber, hits);
      return true;
    }
    hits.push(currentTime);
    submitsByBuild.set(issueNumber, hits);
    return false;
  }

  async function markBuilding(issueNumber: number, record: SubmissionRecord, by: TransitionActor): Promise<JobState> {
    const state = currentState(record);
    if (!canTransition(state, 'building')) return state;
    await options.store.recordJobTransition(issueNumber, {
      to: 'building',
      at: new Date(now()).toISOString(),
      by,
      reason: 'channel_signal',
    });
    return 'building';
  }

  return {
    async deliver(input): Promise<SourceDeliveryOutcome> {
      let record = await options.store.getSubmission(input.issueNumber);
      if (!record) {
        if (input.authority) {
          throw new SourceDeliveryAuthorityError('job_not_found', 'managed delivery job no longer exists');
        }
        throw new InvalidUploadError('unknown build');
      }

      if (input.authority) {
        const authorityError = managedAuthorityError(record, input, input.authority);
        if (authorityError) throw authorityError;
      }

      if (stopReason(record)) return { accepted: false, rejected: 'stopped' };
      if (isRateLimited(input.issueNumber)) return { accepted: false, rejected: 'rate_limited' };

      if (record.builder === 'self') {
        const cap = selfBuildDeliveryCap();
        const used = record.roundDeliveryCount ?? 0;
        if (used >= cap) {
          return {
            accepted: false,
            rejected: 'delivery_cap',
            deliveryCap: cap,
            deliveriesUsed: used,
          };
        }
        if (!input.kitEngineRef) {
          throw new SourceDeliveryValidationError(
            'kit_engine_ref_required',
            'kitEngineRef is required for self-build deliveries — send the engineRef from the Creator Kit you built against (kit.json / get_kit).',
          );
        }
      }

      const pinnedEngineRef = record.roundKitEngineRef;
      if (pinnedEngineRef && input.kitEngineRef && input.kitEngineRef !== pinnedEngineRef) {
        throw new SourceDeliveryValidationError(
          'kit_engine_ref_mismatch',
          `This round is pinned to Creator Kit engine ${pinnedEngineRef}, not ${input.kitEngineRef}. ` +
            'Call get_kit and submit with the engineRef it returns.',
        );
      }

      const attempt = await options.store.incrementRoundSubmitAttempts(input.issueNumber);
      const builderLabel = builderLabelFromRecord(record.builder, record.dispatch?.backend ?? input.backend);
      const roundGeneration = record.roundGeneration ?? 1;
      const deliveryLog = options.log ? asDeliveryLogger(options.log) : null;

      const emitRefusal = async (kind: 'audio' | 'symbols' | 'typecheck' | 'any-type') => {
        if (kind === 'audio' || kind === 'symbols') {
          await options.store.incrementRoundPreflightRefusal(input.issueNumber, kind);
        }
        if (deliveryLog) {
          logDeliveryPreflightRefused(deliveryLog, {
            issueNumber: input.issueNumber,
            roundGeneration,
            builder: builderLabel,
            mode: input.mode,
            kind,
            attempt,
          });
        }
      };

      // Typecheck preflight uses the pinned kit; skip if unavailable.
      const engineRefForCheck = pinnedEngineRef ?? input.kitEngineRef;
      let typecheckBypass = Boolean(record.roundTypecheckPreflightBypassErrors);
      // Deferred: posted only after storage succeeds, not before.
      const pendingThreadEvents: { kind: 'blocked' | 'milestone'; text: string }[] = [];
      if (options.kitFileStore && engineRefForCheck) {
        try {
          const tree = await options.kitFileStore.loadTree(engineRefForCheck);
          const kitShared = sharedSourcesFromKitTree(tree);
          const sources: Record<string, string> = {};
          for (const file of input.files) {
            sources[file.path.trim()] = file.content;
          }
          const check = await runTypecheckPreflight({
            slug: input.slug,
            sources,
            kitShared,
          });
          if (!check.ok) {
            const prior = record.roundTypecheckPreflightRefusals ?? 0;
            if (prior < TYPECHECK_PREFLIGHT_MAX_REFUSALS) {
              await options.store.incrementRoundTypecheckPreflightRefusals(input.issueNumber);
              await emitRefusal('typecheck');
              throw new InvalidUploadError(check.message, 'typecheck');
            }
            // Soft bypass: still count as a refusal for MR-07, then accept.
            await emitRefusal('typecheck');
            typecheckBypass = true;
            await options.store.setRoundTypecheckPreflightBypassErrors(input.issueNumber, check.message);
            options.log?.warn?.(
              {
                issueNumber: input.issueNumber,
                slug: input.slug,
                engineRef: engineRefForCheck,
                durationMs: check.durationMs,
                message: check.message,
              },
              `typecheck preflight bypassed after refusal cap: ${check.message}`,
            );
            pendingThreadEvents.push({
              kind: 'blocked',
              text: `Delivered without a passing typecheck after ${TYPECHECK_PREFLIGHT_MAX_REFUSALS} failed attempts: ${check.message}`,
            });
          } else {
            // A skipped check is not a pass; leave the bypass state alone.
            if (record.roundTypecheckPreflightBypassErrors && !check.skipped) {
              typecheckBypass = false;
              await options.store.setRoundTypecheckPreflightBypassErrors(input.issueNumber, null);
              pendingThreadEvents.push({
                kind: 'milestone',
                text: "Typecheck now passes — this round's earlier bypass warning no longer applies.",
              });
            }
            if (check.skipped === 'timeout') {
              options.log?.warn?.(
                { issueNumber: input.issueNumber, slug: input.slug, durationMs: check.durationMs },
                'typecheck preflight skipped: budget exceeded',
              );
              pendingThreadEvents.push({
                kind: 'blocked',
                text: "Delivered without typecheck validation — the check ran out of time on this round's budget.",
              });
            }
          }
        } catch (error) {
          if (error instanceof InvalidUploadError) throw error;
          options.log?.warn?.(
            { err: error, issueNumber: input.issueNumber, engineRef: engineRefForCheck },
            'typecheck preflight skipped: kit load failed',
          );
        }
      }

      if (record.slug && record.slug !== input.slug) {
        if (input.authority) {
          throw new SourceDeliveryAuthorityError(
            'slug_mismatch',
            `managed delivery is for ${record.slug}, not ${input.slug}`,
          );
        }
        throw new InvalidUploadError(`this build delivers to ${record.slug}, not ${input.slug}`);
      }
      if (!record.slug) {
        if (!input.bindSlug || input.authority) {
          throw new SourceDeliveryAuthorityError(
            'slug_mismatch',
            'managed delivery requires the job to have a bound slug',
          );
        }
        await options.store.setSubmissionSlug(input.issueNumber, input.slug);
        record = (await options.store.getSubmission(input.issueNumber)) ?? record;
      }

      const transitionActor: TransitionActor = input.actor === 'creator' ? 'creator' : 'agent';
      const stateAfterSignal = await markBuilding(input.issueNumber, record, transitionActor);
      let version: string;
      try {
        ({ version } = await options.gamesStore.putCandidateSources({
          slug: input.slug,
          issueNumber: input.issueNumber,
          roundGeneration,
          files: input.files,
          backend: input.backend ?? record.dispatch?.backend ?? record.builder,
          mode: input.mode,
          ...(input.kitEngineRef ? { kitEngineRef: input.kitEngineRef } : {}),
          ...(input.authorship ? { authorship: input.authorship } : {}),
          ...(input.summary ? { summary: input.summary } : {}),
        }));
      } catch (error) {
        if (
          error instanceof InvalidUploadError &&
          (error.kind === 'audio' || error.kind === 'symbols' || error.kind === 'any-type')
        ) {
          await emitRefusal(error.kind);
        }
        throw error;
      }
      for (const event of pendingThreadEvents) {
        try {
          await reportDeliveryEvent(options.store, translator, input.issueNumber, event.kind, event.text);
        } catch (error) {
          // Decorative: a stored version must not roll back over an event write.
          options.log?.warn?.({ err: error, issueNumber: input.issueNumber }, 'delivery thread event not stored');
        }
      }

      if (input.mode === 'preview') {
        await options.store.setSubmissionPreviewVersion(input.issueNumber, version);
      } else {
        await options.store.setSubmissionDeliveredVersion(input.issueNumber, version);
      }
      await options.store.incrementRoundDeliveryCount(input.issueNumber);

      if (deliveryLog) {
        const latest = (await options.store.getSubmission(input.issueNumber)) ?? record;
        const startedMs = latest.roundStartedAt ? Date.parse(latest.roundStartedAt) : NaN;
        logDeliveryAccepted(deliveryLog, {
          issueNumber: input.issueNumber,
          roundGeneration,
          builder: builderLabel,
          mode: input.mode,
          submitAttempts: latest.roundSubmitAttempts ?? attempt,
          refusals: {
            audio: latest.roundPreflightRefusalsAudio ?? 0,
            symbols: latest.roundPreflightRefusalsSymbols ?? 0,
            typecheck: latest.roundTypecheckPreflightRefusals ?? 0,
          },
          msFromRoundStart: Number.isFinite(startedMs) ? Math.max(0, now() - startedMs) : null,
          typecheckBypass,
        });
      }

      const spec = input.files.find((file) => file.path === 'SPEC.md')?.content;
      const deliveredTitle = spec ? parseSpecTitle(spec) : null;
      if (deliveredTitle) {
        const sanitized = sanitizeCreatorText(deliveredTitle, { singleLine: true }).slice(0, 80);
        if (sanitized.length >= 3 && sanitized !== record.title) {
          await options.store.setSubmissionTitle(input.issueNumber, sanitized);
        }
      }

      if (input.mode === 'publish' && canTransition(stateAfterSignal, 'submitted')) {
        await options.store.recordJobTransition(input.issueNumber, {
          to: 'submitted',
          at: new Date(now()).toISOString(),
          by: transitionActor,
          reason: 'sources_delivered',
        });
      }

      // Assemble fast in-process preview via staged preview publisher.
      if (options.stagedPreviews?.publishCandidate) {
        await options.stagedPreviews
          .publishCandidate({
            issueNumber: input.issueNumber,
            slug: input.slug,
            version,
            roundGeneration,
            files: input.files,
            kitEngineRef: input.kitEngineRef,
            locale: record.locale,
          })
          .catch((err: unknown) => {
            options.log?.warn?.({ err, slug: input.slug, version }, 'candidate preview generation failed');
          });
      }

      const gate = await options.onSourcesDelivered?.({
        issueNumber: input.issueNumber,
        slug: input.slug,
        version,
        ...(input.mode === 'preview' ? { mode: 'preview' as const } : {}),
      });
      const buildId = gate && typeof gate === 'object' && typeof gate.buildId === 'string' ? gate.buildId : undefined;
      const gateStarted = Boolean(buildId || (gate && typeof gate === 'object' && gate.accepted === true));
      if (buildId) {
        await options.store
          .recordJobCost(input.issueNumber, {
            kind: 'gate_run',
            at: new Date(now()).toISOString(),
            by: 'cloud-build',
            ref: buildId,
          })
          .catch((error) => {
            options.log?.error({ err: error, issueNumber: input.issueNumber }, 'could not record gate cost');
          });
      }

      options.onEvent?.(input.issueNumber);
      // A creator's own manual delivery is not the agent resuming.
      await options.store.touchLastAgentSignalAt(input.issueNumber, undefined, undefined, {
        preserveEnded: transitionActor === 'creator',
      });

      return {
        accepted: true,
        slug: input.slug,
        version,
        mode: input.mode,
        gateStarted,
        ...(buildId ? { buildId } : {}),
      };
    },
  };
}
