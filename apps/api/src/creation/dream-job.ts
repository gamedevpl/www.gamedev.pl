import { MAX_SHOT_BYTES, type CreatorProposal, type CreatorProposalOption } from '@gamedevpl/contract';
import { DREAM_FRAME_SHOT_LABEL, DREAM_SOURCE_SHOT_LABEL } from '../platform/dream-shots.js';
import { imageSize, isPng, sameAspectRatio, type ImageSize } from '../platform/image-size.js';
import type { Store } from '../platform/store.js';
import { dreamClaimHolds } from '../store/slices/round-budget.js';
import type { SubmissionRecord } from '../store/records/submission.js';
import type { DreamAvailabilityGate } from './dream-availability.js';
import type { DreamFrame, DreamFrameGenerator } from './dream-frames.js';
import { hudCoverage, PURE_UI_COVERAGE, type HudRegionsReader } from './hud-regions.js';
import type { NextIdea, NextIdeaGenerator } from './next-ideas.js';

// Two directions per proposal; a third would be a menu again.
export const DREAM_OPTIONS = 2;

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

export const PROPOSAL_TEXT_EN = 'I sketched two directions for the next round. Tap one to see it.';
export const PROPOSAL_TEXT_PL = 'Naszkicowałem dwa kierunki na następną rundę. Kliknij, żeby zobaczyć.';

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
  const size = imageSize(bytes);
  return size ? { bytes, size } : null;
}

export function createDreamJob(deps: DreamJobDeps): DreamJob {
  const { store, gamesStore, availability, ideas, frames, readHudRegions, log } = deps;
  const now = deps.now ?? Date.now;

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

  async function run(input: DreamRunInput, claimedAt: string): Promise<DreamOutcome> {
    const { record, version, screenshotPath } = input;
    const jobId = record.jobId;
    // The same predicate the claim uses; two spellings would drift apart.
    if (dreamClaimHolds(record.dreamRun, version, new Date(now()).toISOString())) return 'already_ran';
    if (!(await store.claimDreamRun(jobId, version, claimedAt))) return 'already_ran';
    if (!(await availability.dreamingEnabled())) return 'paused';
    if ((await store.getUser(record.ownerUid))?.proposalsMutedAt) return 'muted';
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
    // The reads above take real time; the switch may have moved since.
    if (!(await availability.dreamingEnabled())) return 'paused';
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
      const result = await dreamFrame({ idea, sourcePng, size, styleNote, hudRegions, jobId });
      if (result) dreamed.push(result);
    }
    // The copy promises two directions; one is not a choice.
    if (dreamed.length < DREAM_OPTIONS) return 'no_frames';

    // Cheap check before three writes; the post settles the race.
    const current = await store.getSubmission(jobId);
    if ((current?.previewVersion ?? current?.deliveredVersion) !== version) return 'superseded';
    if (current?.dreamRun?.version !== version) return 'superseded';

    const sourceShot = await store.appendBuildShot(jobId, {
      data: sourcePng,
      mediaType: 'image/png',
      label: DREAM_SOURCE_SHOT_LABEL,
    });
    const options: CreatorProposalOption[] = [];
    for (const { frame, idea } of dreamed) {
      const shot = await store.appendBuildShot(jobId, {
        data: frame.data,
        mediaType: frame.mediaType,
        label: DREAM_FRAME_SHOT_LABEL,
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
    const posted = await store.appendProposalMessage(jobId, { version, claimedAt }, PROPOSAL_TEXT_EN, {
      textLocalized: PROPOSAL_TEXT_PL,
      locale: 'pl',
      proposal,
    });
    if (!posted) return 'superseded';
    deps.onPosted?.(jobId);
    return 'posted';
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
