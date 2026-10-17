// visual_target: an AI-edited gate frame the builder aims its code at.

import type { GamesStore } from '../delivery/games-store.js';
import { canonicalAppBaseUrl } from '../platform/canonical-app-url.js';
import { carriesPixels, imageSize, isJpeg, isPng, sameAspectRatio } from '../platform/image-size.js';
import { MAX_PROPOSAL_FRAME_BYTES, VISUAL_TARGET_SHOT_LABEL } from '../platform/dream-shots.js';
import type { Store, SubmissionRecord } from '../platform/store.js';
import type { DreamAvailabilityGate } from '../creation/dream-availability.js';
import type { DreamFrameGenerator } from '../creation/dream-frames.js';
import { fitDreamSource } from '../platform/dream-source.js';
import { gateFrameOf } from './agent-channel-proposal.js';
import { opensManagedRound, type ManagedOpener } from './mcp-managed-round.js';
import { mintReferenceImageToken, REFERENCE_IMAGE_DOWNLOAD_ROUTE } from './reference-image-url.js';
import {
  SESSION_KEY_PROP,
  toolErr,
  toolOk,
  toolRefusal,
  type ToolContext,
  type ToolHandler,
  type ToolResult,
} from './mcp-tool-support.js';

// Per round; each call is one paid image-model frame.
export const VISUAL_TARGETS_PER_ROUND = 2;
const MAX_DIRECTION = 400;
const THROTTLE_RETRY_SECONDS = 30;

function isThrottled(error: unknown): boolean {
  if ((error as { status?: unknown } | null)?.status === 429) return true;
  return /\b429\b|RESOURCE_EXHAUSTED/.test(error instanceof Error ? error.message : String(error));
}

export interface VisualTargetToolsDeps {
  resolveAuth: (
    ctx: ToolContext,
    args: Record<string, unknown>,
  ) => Promise<{ jobId: number; record: SubmissionRecord; claims: { roundGeneration?: number } } | ToolResult>;
  // Claims of a managed-session opener bearer, else null.
  managedOpener: (ctx: ToolContext) => ManagedOpener | null;
  store: Store | undefined;
  gamesStore: GamesStore | null | undefined;
  frames: DreamFrameGenerator | null | undefined;
  availability: Pick<DreamAvailabilityGate, 'dreamingEnabled' | 'spendFrameSlots'> | null | undefined;
  agentTokenSecret: string | undefined;
  now?: () => number;
}

export interface VisualTargetToolEntry {
  annotations: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: ToolHandler;
}

export function createVisualTargetTools(deps: VisualTargetToolsDeps): Record<string, VisualTargetToolEntry> {
  const now = deps.now ?? Date.now;

  const handler: ToolHandler = async (args, ctx) => {
    const auth = await deps.resolveAuth(ctx, args);
    if (!('jobId' in auth)) return auth;
    // Platform builder sessions only; the opener must name this round.
    const opener = deps.managedOpener(ctx);
    const { jobId, record } = auth;
    const current = record.roundGeneration ?? 1;
    // A URL result needs a shell to open it.
    if (!opensManagedRound(opener, auth, now()) || opener.shell !== true) {
      return toolRefusal('visual_target is not available here', 'not_owner');
    }
    const { store, gamesStore, frames, availability, agentTokenSecret } = deps;
    if (!store || !gamesStore || !frames || !availability || !agentTokenSecret) {
      return toolRefusal('visual targets are not configured', 'feature_unavailable');
    }
    const direction = typeof args.direction === 'string' ? args.direction.trim().slice(0, MAX_DIRECTION) : '';
    if (!direction) return toolRefusal('direction is required', 'invalid_arguments');

    const generation = current;

    const version = record.previewVersion ?? record.deliveredVersion;
    const path = record.slug && version ? gateFrameOf(await gamesStore.getManifest(record.slug, version)) : null;
    const source = path ? await gamesStore.getDerivedArtifact(record.slug!, version!, path) : null;
    const fitted = fitDreamSource(source);
    if ('refused' in fitted) return toolErr('no green gate capture of this game yet; the target is drawn on one');
    const { image: sourceImage, size } = fitted;

    if (!(await availability.dreamingEnabled())) {
      return toolRefusal('image generation is switched off right now', 'feature_unavailable');
    }
    // Attempts, reserved atomically before any spend: failures count too.
    const used = await store.reserveVisualTarget(jobId, generation, VISUAL_TARGETS_PER_ROUND).catch(() => undefined);
    if (used === undefined) return toolErr('this round is no longer current');
    if (used === null) {
      return toolRefusal(`this round already used its ${VISUAL_TARGETS_PER_ROUND} visual targets`, 'quota_exhausted');
    }
    if (!(await availability.spendFrameSlots(new Date(now()).toISOString().slice(0, 10), 1))) {
      // No image was bought, so the round keeps its attempt.
      await store.releaseVisualTarget(jobId, generation).catch(() => undefined);
      return toolRefusal('the daily image allowance is spent', 'quota_exhausted');
    }
    let throttled = false;
    const frame = await frames
      .generate({
        source: sourceImage,
        width: size.width,
        height: size.height,
        styleNote: `the browser game "${record.title}"`,
        direction,
        hudRegions: [],
      })
      .catch((error: unknown) => {
        throttled = isThrottled(error);
        return null;
      });
    if (throttled) {
      // A throttled call bills nothing; the round keeps its attempt.
      await store.releaseVisualTarget(jobId, generation).catch(() => undefined);
      return toolRefusal('the image model is busy', 'rate_limited', { retryAfterSeconds: THROTTLE_RETRY_SECONDS });
    }
    // Best-effort: a ledger outage must not void a paid call.
    await store
      .recordJobCost(jobId, { kind: 'concept', at: new Date(now()).toISOString(), by: frames.model })
      .catch(() => undefined);
    // Same checks as Studio concepts: one Firestore doc, renderable pixels.
    const bytes = frame ? Buffer.from(frame.data, 'base64') : Buffer.alloc(0);
    const declared = frame?.mediaType === 'image/jpeg' ? isJpeg(bytes) : isPng(bytes);
    const drawn = declared && carriesPixels(bytes) ? imageSize(bytes) : null;
    // Providers may ignore the size ask; reshaping loses the HUD.
    if (!frame || bytes.length > MAX_PROPOSAL_FRAME_BYTES || !drawn || !sameAspectRatio(drawn, size)) {
      return toolErr('the image model returned no usable frame; build from the words instead');
    }

    const shot = await store.appendBuildShot(
      jobId,
      {
        data: frame.data,
        mediaType: frame.mediaType,
        label: VISUAL_TARGET_SHOT_LABEL,
        platformDrawn: true,
        ...(generation !== undefined ? { roundGeneration: generation } : {}),
      },
      generation,
    );
    const minted = mintReferenceImageToken(agentTokenSecret, { jobId, shotId: shot.id, nowMs: now() });
    return toolOk({
      url: `${canonicalAppBaseUrl()}${REFERENCE_IMAGE_DOWNLOAD_ROUTE}?t=${encodeURIComponent(minted.token)}`,
      expiresAt: minted.expiresAt,
      sourceVersion: version,
      remaining: VISUAL_TARGETS_PER_ROUND - used,
    });
  };

  return {
    visual_target: {
      annotations: {
        title: 'Draw a visual target',
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
      outputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          expiresAt: { type: 'string' },
          sourceVersion: { type: 'string' },
          remaining: { type: 'number' },
        },
        required: ['url', 'expiresAt', 'remaining'],
      },
      description:
        'Returns a download URL for an image-model edit of the latest green gate frame of this game, ' +
        'changed as `direction` describes, with the HUD kept as is. The image is a reference for how the ' +
        'game could look; it is never a game asset. Limited per round and per day; each call costs an image.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionKey: SESSION_KEY_PROP,
          direction: { type: 'string', maxLength: MAX_DIRECTION },
        },
        required: ['direction'],
      },
      handler,
    },
  };
}
