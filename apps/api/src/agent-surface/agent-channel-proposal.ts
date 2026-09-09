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
  | 'frame_shape';

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

interface ProposalManifest {
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
function gateFrameOf(manifest: ProposalManifest | null): string | null {
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

      const reject = async (rejected: ProposalRefusal) =>
        reply.send({ accepted: false, rejected, ...(await channelState(jobId, record)) });

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

      // A late claim would overwrite a newer one; refuse instead.
      const current = await store.getSubmission(jobId);
      if ((current?.previewVersion ?? current?.deliveredVersion) !== version) return reject('already_proposed');
      const claimedAt = new Date().toISOString();
      if (!(await store.claimDreamRun(jobId, version, claimedAt))) return reject('already_proposed');

      const sourceShot = await store.appendBuildShot(jobId, {
        data: source.toString('base64'),
        mediaType: 'image/png',
        label: DREAM_SOURCE_SHOT_LABEL,
        platformDrawn: true,
      });
      const options: CreatorProposalOption[] = parsed.data.options.map((option, index) => ({
        id: `agent-${index + 1}`,
        label: pair(option.label, option.labelLocalized, record.locale, MAX_PROPOSAL_LABEL),
        prompt: pair(option.prompt, option.promptLocalized, record.locale, MAX_PROPOSAL_PROMPT),
        frameRef: option.frameId,
      }));
      await store.appendCreatorMessage(jobId, PROPOSAL_TEXT_EN, {
        origin: 'studio',
        delivered: true,
        textLocalized: PROPOSAL_TEXT_PL,
        locale: 'pl',
        proposal: { sourceRef: sourceShot.id, version, options },
      });
      deps.onPosted?.(jobId);

      return reply.send({
        accepted: true,
        version,
        ...(await channelState(jobId, (await store.getSubmission(jobId)) ?? record)),
      });
    },
  );
}
