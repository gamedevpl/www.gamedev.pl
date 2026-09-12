import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AGENT_CHANNEL_ROUTES, MAX_SHOT_BYTES, type CreatorProposalOption } from '@gamedevpl/contract';
import {
  DREAM_FRAME_SHOT_LABEL,
  DREAM_SOURCE_SHOT_LABEL,
  MAX_PROPOSAL_FRAME_BYTES,
  PROPOSAL_TEXT_EN,
  PROPOSAL_TEXT_PL,
} from '../platform/dream-shots.js';
import { imageSize, isPng, sameAspectRatio } from '../platform/image-size.js';
import { sanitizeCreatorText } from '../platform/submission-status.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { ProposalRefusedBy } from '../store/slices/build-log.js';

// Two directions, same as the platform's own proposal.
export const PROPOSAL_OPTIONS = 2;

export const MAX_PROPOSAL_LABEL = 60;
export const MAX_PROPOSAL_PROMPT = 400;

export type ProposalRefusal =
  | 'stopped'
  | 'paused'
  | 'muted'
  | 'already_proposed'
  | 'no_screenshot'
  | 'frame_missing'
  | 'frame_stale'
  | 'frame_shape'
  // A label or prompt that is nothing but markup once sanitized.
  | 'empty_text';

// The store decided; this only names the decision for the agent.
const REFUSAL_OF: Record<ProposalRefusedBy, ProposalRefusal> = {
  blocked: 'stopped',
  paused: 'paused',
  muted: 'muted',
  round: 'frame_stale',
  claim: 'already_proposed',
};

const OptionSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PROPOSAL_LABEL * 4),
  prompt: z
    .string()
    .trim()
    .min(1)
    .max(MAX_PROPOSAL_PROMPT * 4),
  labelLocalized: z
    .string()
    .trim()
    .max(MAX_PROPOSAL_LABEL * 4)
    .optional(),
  promptLocalized: z
    .string()
    .trim()
    .max(MAX_PROPOSAL_PROMPT * 4)
    .optional(),
  frameId: z.string().trim().min(1).max(200),
});

const ProposalInputSchema = z.object({
  options: z.array(OptionSchema).length(PROPOSAL_OPTIONS),
});

export interface ProposalManifest {
  gate?: { green?: boolean; screenshot?: string };
  previewGate?: { green?: boolean; screenshot?: string };
}

export interface AgentChannelProposalRoutesDeps {
  resolveBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<{ jobId: number; record: SubmissionRecord } | null>;
  store: Store | undefined;
  gamesStore:
    | {
        getManifest(slug: string, version: string): Promise<ProposalManifest | null>;
        getDerivedArtifact(slug: string, version: string, name: string): Promise<Buffer | null>;
      }
    | undefined;
  // The operator's kill switch, shared with the dream job.
  dreamingEnabled: () => Promise<boolean>;
  stopReason: (record: SubmissionRecord) => string | null;
  channelState: (jobId: number, record: SubmissionRecord) => Promise<Record<string, unknown>>;
  onPosted?: (jobId: number) => void;
}

function pair(text: string, localized: string | undefined, locale: string | undefined, max: number) {
  const en = sanitizeCreatorText(text, { singleLine: true }).slice(0, max);
  const other = localized ? sanitizeCreatorText(localized, { singleLine: true }).slice(0, max) : '';
  // Stored as en/pl; a localized string counts only for pl.
  return { en, pl: locale === 'pl' && other ? other : en };
}

// The frame compared against is ours, never the agent's.
export function gateFrameOf(manifest: ProposalManifest | null): string | null {
  if (manifest?.gate?.green && manifest.gate.screenshot) return manifest.gate.screenshot;
  if (manifest?.previewGate?.green && manifest.previewGate.screenshot) return manifest.previewGate.screenshot;
  return null;
}

export function registerAgentChannelProposalRoutes(app: FastifyInstance, deps: AgentChannelProposalRoutesDeps): void {
  const { resolveBuild, store, gamesStore, dreamingEnabled, stopReason, channelState } = deps;

  app.post(
    AGENT_CHANNEL_ROUTES.PROPOSAL,
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply);
      if (!resolved) return reply;
      const { jobId, record } = resolved;
      if (!store || !gamesStore) {
        return reply.status(503).send({ error: 'the build channel is not configured' });
      }

      const parsed = ProposalInputSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
      }

      // `on` is the row refused on; `control.stop` reads from it.
      const reject = async (rejected: ProposalRefusal, on: SubmissionRecord = record) =>
        reply.send({ accepted: false, rejected, ...(await channelState(jobId, on)) });

      if (stopReason(record)) return reject('stopped');
      if (!(await dreamingEnabled())) return reject('paused');
      if ((await store.getUser(record.ownerUid))?.proposalsMutedAt) return reject('muted');

      const version = record.previewVersion ?? record.deliveredVersion;
      if (!record.slug || !version) return reject('no_screenshot');

      const screenshotPath = gateFrameOf(await gamesStore.getManifest(record.slug, version));
      if (!screenshotPath) return reject('no_screenshot');
      const source = await gamesStore.getDerivedArtifact(record.slug, version, screenshotPath);
      if (!source || source.length === 0 || source.length > MAX_SHOT_BYTES || !isPng(source)) {
        return reject('no_screenshot');
      }
      const size = imageSize(source);
      if (!size) return reject('no_screenshot');

      // Markup sanitizes away; a blank direction would spend the claim.
      const texts = parsed.data.options.map((option) => ({
        label: pair(option.label, option.labelLocalized, record.locale, MAX_PROPOSAL_LABEL),
        prompt: pair(option.prompt, option.promptLocalized, record.locale, MAX_PROPOSAL_PROMPT),
      }));
      if (texts.some(({ label, prompt }) => !label.en || !prompt.en)) return reject('empty_text');

      const frameIds = parsed.data.options.map((option) => option.frameId);
      if (new Set(frameIds).size !== frameIds.length) return reject('frame_missing');
      const roundGeneration = record.roundGeneration ?? 1;
      const frames = await Promise.all(frameIds.map((id) => store.getBuildShot(jobId, id)));
      for (const frame of frames) {
        // Only an uploaded concept frame counts; we set the caption.
        if (!frame || frame.label !== DREAM_FRAME_SHOT_LABEL) return reject('frame_missing');
        // A round delivers several previews; pin the frame to one.
        if (frame.roundGeneration !== roundGeneration || frame.deliveryVersion !== version) {
          return reject('frame_stale');
        }
        const bytes = Buffer.from(frame.data, 'base64');
        if (bytes.length === 0 || bytes.length > MAX_PROPOSAL_FRAME_BYTES) return reject('frame_missing');
        const frameSize = imageSize(bytes);
        // A frame that changed shape repainted the HUD.
        if (!frameSize || !sameAspectRatio(frameSize, size)) return reject('frame_shape');
      }

      // The claim refuses unless this delivery is still current, in one transaction.
      const claimedAt = new Date().toISOString();
      if (!(await store.claimDreamRun(jobId, version, claimedAt, roundGeneration))) return reject('already_proposed');

      const sourceShot = await store.appendBuildShot(jobId, {
        data: source.toString('base64'),
        mediaType: 'image/png',
        label: DREAM_SOURCE_SHOT_LABEL,
        platformDrawn: true,
      });
      const options: CreatorProposalOption[] = parsed.data.options.map((option, index) => ({
        id: `agent-${index + 1}`,
        ...texts[index]!,
        frameRef: option.frameId,
      }));
      // The platform job's posting transaction: claim, mute and stamp together.
      const result = await store.appendProposalMessage(jobId, { version, claimedAt }, PROPOSAL_TEXT_EN, {
        textLocalized: PROPOSAL_TEXT_PL,
        locale: 'pl',
        proposal: { sourceRef: sourceShot.id, version, options, builder: 'self' },
        ownerUid: record.ownerUid,
        roundGeneration,
        blocked: (job) => stopReason(job) !== null,
      });
      if (result.posted === null) {
        // The guard that fired, not a guess reconstructed from later reads.
        const live = (await store.getSubmission(jobId)) ?? record;
        return reject(REFUSAL_OF[result.refusedBy], live);
      }
      deps.onPosted?.(jobId);

      return reply.send({
        accepted: true,
        version,
        ...(await channelState(jobId, (await store.getSubmission(jobId)) ?? record)),
      });
    },
  );
}
