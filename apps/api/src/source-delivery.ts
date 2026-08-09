import { selfBuildDeliveryCap } from './builder.js';
import { InvalidUploadError, type GamesStore, type SourceFile } from './games-store.js';
import { parseSpecTitle } from './github-client.js';
import { canTransition, resolveJobState, TERMINAL_JOB_STATES, type JobState } from './job-state.js';
import { sanitizeCreatorText } from './submission-status.js';
import type { Store, SubmissionRecord } from './store.js';

export interface SourceDeliveryAuthority {
  /** The backend identity recorded at dispatch time. */
  backend: string;
  /** The vendor session that produced these files. */
  sessionRef: string;
  /** The round generation captured when that session was started. */
  roundGeneration: number;
}

export interface SourceDeliveryInput {
  issueNumber: number;
  slug: string;
  files: SourceFile[];
  mode: 'preview' | 'publish';
  backend?: string;
  kitEngineRef?: string;
  /**
   * Channel deliveries may bind a legacy job's missing slug before writing. Managed
   * harvests never may: their authority must match a slug already on the job.
   */
  bindSlug?: boolean;
  authority?: SourceDeliveryAuthority;
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

export interface SourceDeliveryService {
  deliver(input: SourceDeliveryInput): Promise<SourceDeliveryOutcome>;
}

export interface SourceDeliveryServiceOptions {
  store: Store;
  gamesStore: GamesStore;
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
    error: (context: object, message: string) => void;
  };
}

const DEFAULT_MAX_SUBMITS_PER_WINDOW = 20;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

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

  async function markBuilding(issueNumber: number, record: SubmissionRecord): Promise<JobState> {
    const state = currentState(record);
    if (!canTransition(state, 'building')) return state;
    await options.store.recordJobTransition(issueNumber, {
      to: 'building',
      at: new Date(now()).toISOString(),
      by: 'agent',
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
          throw new InvalidUploadError(
            'kitEngineRef is required for self-build deliveries — send the engineRef from the Creator Kit you built against (kit.json / get_kit).',
          );
        }
      }

      const pinnedEngineRef = record.roundKitEngineRef;
      if (pinnedEngineRef && input.kitEngineRef && input.kitEngineRef !== pinnedEngineRef) {
        throw new InvalidUploadError(
          `This round is pinned to Creator Kit engine ${pinnedEngineRef}, not ${input.kitEngineRef}. ` +
            'Call get_kit and submit with the engineRef it returns.',
        );
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

      const stateAfterSignal = await markBuilding(input.issueNumber, record);
      const { version } = await options.gamesStore.putCandidateSources({
        slug: input.slug,
        issueNumber: input.issueNumber,
        files: input.files,
        backend: input.backend ?? record.dispatch?.backend ?? record.builder,
        mode: input.mode,
        ...(input.kitEngineRef ? { kitEngineRef: input.kitEngineRef } : {}),
      });

      if (input.mode === 'preview') {
        await options.store.setSubmissionPreviewVersion(input.issueNumber, version);
      } else {
        await options.store.setSubmissionDeliveredVersion(input.issueNumber, version);
      }
      if (record.builder === 'self') {
        await options.store.incrementRoundDeliveryCount(input.issueNumber);
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
          by: 'agent',
          reason: 'sources_delivered',
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
      await options.store.touchLastAgentSignalAt(input.issueNumber);

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
