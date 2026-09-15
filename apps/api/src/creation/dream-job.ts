import { randomUUID } from 'node:crypto';
import { MAX_SHOT_BYTES, type CreatorProposal, type CreatorProposalOption } from '@gamedevpl/contract';
import {
  DREAM_FRAME_SHOT_LABEL,
  DREAM_SOURCE_SHOT_LABEL,
  PROPOSAL_TEXT_EN,
  PROPOSAL_TEXT_PL,
} from '../platform/dream-shots.js';
import { carriesPixels, imageSize, isJpeg, isPng, sameAspectRatio, type ImageSize } from '../platform/image-size.js';
import type { Store } from '../platform/store.js';
import { dreamClaimHolds, ownsDreamClaim } from '../store/slices/round-budget.js';
import { postedAttemptKey, type ProposalRefusedBy } from '../store/slices/build-log.js';
import { resolveJobState } from './job-state.js';
import type { SubmissionRecord } from '../store/records/submission.js';
import type { DreamAvailabilityGate } from './dream-availability.js';
import type { DreamFrame, DreamFrameGenerator } from './dream-frames.js';
import { hudCoverage, PURE_UI_COVERAGE, type HudRegionsReader } from './hud-regions.js';
import type { NextIdea, NextIdeaGenerator } from './next-ideas.js';
import { currentOwnerUid } from '../platform/game-access-resolve.js';

// Two directions per proposal; a third would be a menu again.
export const DREAM_OPTIONS = 2;

// A blip must not strand them; an outage is logged instead.
const ORPHAN_LOG = 'proposal shots may be orphaned; delete only if no card references them';
export const DISCARD_ATTEMPTS = 3;
export const DISCARD_BACKOFF_MS = 250;

// One image-model frame; Firestore holds it base64 in one document.
export const MAX_DREAM_FRAME_BYTES = 600 * 1024;

export type DreamOutcome =
  | 'posted'
  | 'already_ran'
  | 'paused'
  | 'muted'
  | 'no_capacity'
  | 'no_screenshot'
  | 'no_hud'
  | 'pure_ui'
  | 'no_ideas'
  | 'no_frames'
  | 'superseded'
  | 'failed';

// Naming for the store's refusal; a lost claim means superseded.
const OUTCOME_OF: Record<ProposalRefusedBy, DreamOutcome> = {
  paused: 'paused',
  muted: 'muted',
  blocked: 'superseded',
  round: 'superseded',
  version: 'superseded',
  claim: 'superseded',
};

export interface DreamLog {
  error: (context: object, message: string) => void;
  warn: (context: object, message: string) => void;
  info: (context: object, message: string) => void;
}

export interface DreamJobDeps {
  store: Store;
  gamesStore: { getDerivedArtifact(slug: string, version: string, name: string): Promise<Buffer | null> };
  availability: DreamAvailabilityGate;
  ideas: NextIdeaGenerator;
  frames: DreamFrameGenerator;
  readHudRegions: HudRegionsReader;
  log: DreamLog;
  now?: () => number;
  // A seam beside `now`; tests must not wait on the cleanup backoff.
  wait?: (ms: number) => Promise<void>;
  // Called once a proposal is stored, so the next poll shows it.
  onPosted?: (jobId: number) => void;
}

export interface DreamRunInput {
  record: SubmissionRecord;
  version: string;
  screenshotPath?: string;
}

export interface DreamJob {
  runForVersion(input: DreamRunInput): Promise<DreamOutcome>;
}

function styleNoteFor(record: SubmissionRecord): string {
  const concept = (record.spec ?? '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const title = record.title?.trim();
  if (title && concept) return `"${title}", a browser game: ${concept}`;
  if (title) return `"${title}", a browser game`;
  return concept ? `a browser game: ${concept}` : 'a browser game';
}

function decodeFrame(frame: DreamFrame): { bytes: Buffer; size: ImageSize } | null {
  const bytes = Buffer.from(frame.data, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_DREAM_FRAME_BYTES) return null;
  // The card outlives the claim, so an unrenderable frame is permanent.
  if (!carriesPixels(bytes)) return null;
  const declared = frame.mediaType === 'image/png' ? isPng(bytes) : isJpeg(bytes);
  if (!declared) return null;
  const size = imageSize(bytes);
  return size ? { bytes, size } : null;
}

export function createDreamJob(deps: DreamJobDeps): DreamJob {
  const { store, gamesStore, availability, ideas, frames, readHudRegions, log } = deps;
  const now = deps.now ?? Date.now;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function dreamFrame(input: {
    idea: NextIdea;
    sourcePng: string;
    size: ImageSize;
    styleNote: string;
    hudRegions: NonNullable<Awaited<ReturnType<HudRegionsReader>>>;
    jobId: number;
  }): Promise<{ frame: DreamFrame; idea: NextIdea } | null> {
    try {
      const frame = await frames.generate({
        sourcePng: input.sourcePng,
        width: input.size.width,
        height: input.size.height,
        styleNote: input.styleNote,
        direction: input.idea.prompt.en,
        hudRegions: input.hudRegions,
      });
      if (!frame) return null;
      const decoded = decodeFrame(frame);
      if (!decoded) return null;
      // Spike rule: a frame that changed shape redrew the HUD.
      if (!sameAspectRatio(decoded.size, input.size)) {
        log.warn({ jobId: input.jobId, size: decoded.size, source: input.size }, 'dream frame changed aspect ratio');
        return null;
      }
      return { frame, idea: input.idea };
    } catch (error) {
      log.warn({ err: error, jobId: input.jobId }, 'dream frame generation failed');
      return null;
    }
  }

  // Paid model calls belong in the ledger, or the report lies.
  async function bookConcept(jobId: number, model: string): Promise<void> {
    try {
      await store.recordJobCost(jobId, { kind: 'concept', at: new Date(now()).toISOString(), by: model });
    } catch (error) {
      log.error({ err: error, jobId }, 'could not record the cost of a concept call');
    }
  }

  async function run(input: DreamRunInput, claimedAt: string): Promise<DreamOutcome> {
    const { record, version, screenshotPath } = input;
    const jobId = record.jobId;
    // The same predicate the claim uses; two spellings would drift apart.
    if (dreamClaimHolds(record.dreamRun, version, new Date(now()).toISOString(), record.roundGeneration ?? 1))
      return 'already_ran';
    if (!(await store.claimDreamRun(jobId, version, claimedAt, record.roundGeneration ?? 1)).claimed)
      return 'already_ran';
    // The switch, the mute, and anything that moved under this run.
    const stopped = async (): Promise<DreamOutcome | null> => {
      if (!(await availability.dreamingEnabled())) return 'paused';
      // The current owner's, not the uid that built the round.
      const mutedBy = record.slug ? await currentOwnerUid(store, record.slug, record.ownerUid) : record.ownerUid;
      if (mutedBy && (await store.readProposalsMutedAt(mutedBy))) return 'muted';
      const live = await store.getSubmission(jobId);
      // A reopen leaves the version alone, so the generation is the tell.
      if ((live?.roundGeneration ?? 1) !== (record.roundGeneration ?? 1)) return 'superseded';
      if ((live?.previewVersion ?? live?.deliveredVersion) !== version) return 'superseded';
      // A retake after the TTL; two workers must not both write shots.
      if (!ownsDreamClaim(live?.dreamRun, { version, claimedAt })) return 'superseded';
      return null;
    };
    let halt = await stopped();
    if (halt) return halt;
    if (!record.slug || !screenshotPath) return 'no_screenshot';

    const source = await gamesStore.getDerivedArtifact(record.slug, version, screenshotPath);
    if (!source || source.length === 0 || source.length > MAX_SHOT_BYTES || !isPng(source)) return 'no_screenshot';
    const size = imageSize(source);
    if (!size) return 'no_screenshot';

    const hudRegions = await readHudRegions({ slug: record.slug, version, width: size.width, height: size.height });
    if (!hudRegions) return 'no_hud';
    if (hudCoverage(hudRegions, size.width, size.height) >= PURE_UI_COVERAGE) return 'pure_ui';

    if (!record.spec?.trim()) return 'no_ideas';
    // An improvement round runs on a live game.
    const published = Boolean(record.publishedAt) || Boolean(await store.getPublishedSubmissionBySlug(record.slug));
    // The reads above take real time; either flag may have moved since.
    halt = await stopped();
    if (halt) return halt;
    // Booked before the answer: a call that failed still billed.
    await bookConcept(jobId, ideas.model);
    const generated = await ideas.generate({
      spec: record.spec,
      ...(record.qa?.length ? { qa: record.qa } : {}),
      title: record.title,
      published,
      ...(record.locale ? { locale: record.locale } : {}),
    });
    const candidates = generated.slice(0, DREAM_OPTIONS);
    // A slot and an image call for a card that cannot post.
    if (candidates.length < DREAM_OPTIONS) return 'no_ideas';

    const sourcePng = source.toString('base64');
    const styleNote = styleNoteFor(record);
    const dreamed: { frame: DreamFrame; idea: NextIdea }[] = [];
    const dateStr = new Date(now()).toISOString().slice(0, 10);
    // Both frames or neither; one buys nothing.
    if (!(await availability.spendFrameSlots(dateStr, DREAM_OPTIONS))) return 'no_capacity';
    for (const idea of candidates) {
      // An opt-out during one image call cancels the next.
      halt = await stopped();
      if (halt) return halt;
      await bookConcept(jobId, frames.model);
      const result = await dreamFrame({ idea, sourcePng, size, styleNote, hudRegions, jobId });
      if (result) dreamed.push(result);
    }
    // The copy promises two directions; one is not a choice.
    if (dreamed.length < DREAM_OPTIONS) return 'no_frames';

    // Minutes of paid calls have passed; ask every guard again before writing.
    halt = await stopped();
    if (halt) return halt;

    // Reserved labels hide these, so a card that never posts strands them.
    const written: string[] = [];
    // A lost answer hides a commit; `null` means untold.
    const cardLanded = async (): Promise<boolean | null> => {
      try {
        const live = await store.getSubmission(jobId);
        // Not the claim: a newer delivery replaces it and takes `postedAt` along.
        return Boolean(live?.proposalPostedAttempts?.includes(postedAttemptKey({ version, claimedAt })));
      } catch {
        return null;
      }
    };
    // Answers `true` when a look back proves the card landed after all.
    const discard = async (): Promise<boolean> => {
      if (!written.length) return false;
      const landed = await cardLanded();
      // Only a read that answered may condemn these rows.
      if (landed !== false) {
        if (landed === null) log.error({ jobId, shots: written }, ORPHAN_LOG);
        return landed === true;
      }
      for (let attempt = 1; attempt <= DISCARD_ATTEMPTS; attempt += 1) {
        try {
          await store.deleteBuildShots(jobId, written);
          return false;
        } catch (error) {
          if (attempt === DISCARD_ATTEMPTS) {
            log.error({ err: error, jobId, shots: written }, ORPHAN_LOG);
            return false;
          }
          await wait(DISCARD_BACKOFF_MS * 2 ** (attempt - 1));
        }
      }
      return false;
    };
    try {
      // Named before the write; a lost response still leaves an id.
      const sourceId = randomUUID();
      written.push(sourceId);
      const sourceShot = await store.appendBuildShot(jobId, {
        id: sourceId,
        data: sourcePng,
        mediaType: 'image/png',
        label: DREAM_SOURCE_SHOT_LABEL,
        platformDrawn: true,
      });
      const options: CreatorProposalOption[] = [];
      for (const { frame, idea } of dreamed) {
        const frameId = randomUUID();
        written.push(frameId);
        const shot = await store.appendBuildShot(jobId, {
          id: frameId,
          data: frame.data,
          mediaType: frame.mediaType,
          label: DREAM_FRAME_SHOT_LABEL,
          platformDrawn: true,
        });
        options.push({ id: idea.id, label: idea.label, prompt: idea.prompt, frameRef: shot.id });
      }
      const proposal: CreatorProposal = {
        sourceRef: sourceShot.id,
        version,
        options,
        builder: record.builder === 'self' ? 'self' : 'platform',
      };
      // Posted only if the claim still holds, in one transaction.
      const result = await store.appendProposalMessage(jobId, { version, claimedAt }, PROPOSAL_TEXT_EN, {
        textLocalized: PROPOSAL_TEXT_PL,
        locale: 'pl',
        proposal,
        ownerUid: record.ownerUid,
        roundGeneration: record.roundGeneration ?? 1,
        // Publishing is this job's cue; abandoning and cancelling are stops.
        blocked: (job) => Boolean(job.abandonedAt) || resolveJobState(job) === 'canceled',
      });
      if (result.posted === null) {
        // A retry that saw our stamp refuses a card already there.
        if (await discard()) {
          deps.onPosted?.(jobId);
          return 'posted';
        }
        // The guard that fired, reported rather than re-derived from later reads.
        return OUTCOME_OF[result.refusedBy];
      }
      deps.onPosted?.(jobId);
      return 'posted';
    } catch (error) {
      // The throw may have followed a commit, so ask before deleting.
      if (await discard()) {
        deps.onPosted?.(jobId);
        return 'posted';
      }
      // A write that failed part-way leaves the same unreachable rows.
      throw error;
    }
  }

  return {
    async runForVersion(input) {
      const startedAt = now();
      const claimedAt = new Date(now()).toISOString();
      // Any answer ends the claim; the TTL is for silence.
      const finish = async () => {
        await store
          .finishDreamRun(input.record.jobId, { version: input.version, claimedAt }, new Date(now()).toISOString())
          .catch((error: unknown) => log.warn({ err: error, jobId: input.record.jobId }, 'dream claim not closed'));
      };
      try {
        const outcome = await run(input, claimedAt);
        if (outcome !== 'already_ran') {
          await finish();
          log.info(
            { jobId: input.record.jobId, version: input.version, outcome, durationMs: now() - startedAt },
            'dream job finished',
          );
        }
        return outcome;
      } catch (error) {
        log.error({ err: error, jobId: input.record.jobId, version: input.version }, 'dream job failed');
        await finish();
        return 'failed';
      }
    },
  };
}
