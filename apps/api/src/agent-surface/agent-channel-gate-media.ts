import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AGENT_CHANNEL_ROUTES } from '@gamedevpl/contract';
import { STALE_AGENT_TOKEN_REASON } from './agent-token.js';
import type { AgentTokenAccess } from './agent-token.js';
import { deriveGateStatusString, type GateVerdictSummary } from '../delivery/gate-verdict.js';
import { DEFAULT_SIGNED_URL_TTL_SECONDS, type GcsObjectStore } from '../delivery/gcs-sign.js';
import { gateCrashStall } from '../delivery/gate-crash.js';
import { parseGameMedia } from '../catalog/github-client.js';
import type { GamesStore } from '../delivery/games-store.js';
import type { SubmissionRecord } from '../platform/store.js';

// Duplicated from agent-channel.ts SHOT routes — keep both ceilings synced.
const maxShotBytes = 700 * 1024;
// Frame caps guard context cost, not bandwidth — most need one or two.
const MAX_INLINE_FRAMES = 3;
const MAX_INLINE_FRAME_BYTES = 1_400 * 1024;

export interface AgentChannelGateMediaRoutesDeps {
  resolveBuild: (
    request: FastifyRequest,
    reply: FastifyReply,
    options?: { allowTerminalReceipt?: boolean },
  ) => Promise<{ issueNumber: number; record: SubmissionRecord; access: AgentTokenAccess } | null>;
  gamesStore: GamesStore | undefined;
  objectStore: GcsObjectStore | undefined;
  gateVerdict: (record: SubmissionRecord) => Promise<GateVerdictSummary | null>;
}

export function registerAgentChannelGateMediaRoutes(app: FastifyInstance, deps: AgentChannelGateMediaRoutesDeps): void {
  const { resolveBuild, gamesStore, objectStore, gateVerdict } = deps;

  // Version defaults to previewVersion, then deliveredVersion — same order as Studio.
  app.get(
    AGENT_CHANNEL_ROUTES.GATE,
    { config: { rateLimit: { max: 120, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply, { allowTerminalReceipt: true });
      if (!resolved) return reply;
      const { record, access } = resolved;

      const query = request.query as { version?: string };
      const requestedVersion = typeof query.version === 'string' && query.version.trim() ? query.version.trim() : null;
      const version = requestedVersion ?? record.previewVersion ?? record.deliveredVersion ?? null;

      if (!version || !record.slug) {
        return reply.send({
          status: 'pending',
          deliveryId: null,
          summary:
            'nothing has been delivered yet — continue building and call submit_sources first; do not call get_gate_verdict again before a delivery',
          retryAfterSeconds: 30,
          access,
        });
      }

      // Receipt access reads only the round's closing delivery, not other versions.
      if (access === 'terminal_receipt' && version !== record.deliveredVersion) {
        return reply.status(401).send({ error: STALE_AGENT_TOKEN_REASON });
      }

      const gate = await gateVerdict({
        ...record,
        deliveredVersion: record.deliveredVersion === version ? version : undefined,
        previewVersion: version,
      });
      if (!gate) {
        let progress: {
          lane: string;
          stage: string;
          index: number;
          total: number;
          at: string;
        } | null = null;
        try {
          const manifest = await gamesStore?.getManifest(record.slug, version);
          if (manifest?.gateProgress && !manifest.gate && !manifest.previewGate) {
            progress = manifest.gateProgress;
          }
        } catch {
          // ignore
        }
        const crashed = gateCrashStall(record) !== null;
        return reply.send({
          status: crashed ? 'crashed' : 'pending',
          deliveryId: version,
          summary: crashed
            ? 'our gate build failed before it could check your game — this is a platform fault, not your code. Deliver again to start a fresh gate run; the round is still open.'
            : 'gate has not reported yet — do not loop on get_gate_verdict; stop this run and let Studio show the eventual result',
          retryAfterSeconds: 30,
          access,
          ...(progress
            ? {
                progress,
                lane: progress.lane === 'preview' ? 'preview' : 'publish',
              }
            : {}),
        });
      }

      const status = deriveGateStatusString(gate);
      return reply.send({
        status,
        deliveryId: version,
        version: gate.version,
        green: gate.green,
        lane: gate.lane,
        ranAt: gate.ranAt,
        summary: gate.green
          ? 'gate accepted this delivery'
          : gate.status === 'preview_passed'
            ? 'preview check passed — continue iterating, then submit_sources with mode=publish (TRACE required)'
            : gate.status === 'preview_failed'
              ? (gate.report?.split('\n').at(-1) ?? 'preview check refused this delivery')
              : (gate.report?.split('\n').at(-1) ?? 'gate refused this delivery'),
        ...(gate.report ? { report: gate.report } : {}),
        ...(gate.status ? { gateStatus: gate.status } : {}),
        ...('previewPassed' in gate && gate.previewPassed !== undefined ? { previewPassed: gate.previewPassed } : {}),
        access,
      });
    },
  );

  // Serves gate media for agents with no shell or browser (read-only).
  app.get(
    AGENT_CHANNEL_ROUTES.MEDIA,
    { config: { rateLimit: { max: 60, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const resolved = await resolveBuild(request, reply, { allowTerminalReceipt: true });
      if (!resolved) return reply;
      const { record, access } = resolved;

      if (!gamesStore || !objectStore) {
        return reply.status(503).send({ error: 'the media store is not configured' });
      }

      const query = request.query as { version?: string; frames?: string };
      const requestedVersion = typeof query.version === 'string' && query.version.trim() ? query.version.trim() : null;
      const version = requestedVersion ?? record.previewVersion ?? record.deliveredVersion ?? null;

      if (!version || !record.slug) {
        return reply.send({
          available: false,
          deliveryId: null,
          reason: 'nothing has been delivered yet — media is produced by the gate, after submit',
          access,
        });
      }

      // Same receipt rule as the verdict read: only the round's delivery.
      if (access === 'terminal_receipt' && version !== record.deliveredVersion) {
        return reply.status(401).send({ error: STALE_AGENT_TOKEN_REASON });
      }

      // Version arrives via query string; shape-check before signing a path.
      if (!/^[A-Za-z0-9-]+$/.test(version)) {
        return reply.status(400).send({ error: 'invalid version' });
      }

      const slug = record.slug;
      // Ownership check is issueNumber, not slug; absent and not-yours look identical.
      const manifest = await gamesStore.getManifest(slug, version);
      if (!manifest || manifest.issueNumber !== record.issueNumber) {
        return reply.send({
          available: false,
          deliveryId: version,
          reason: 'no such delivery for this build',
          access,
        });
      }

      // Publish verdict wins over preview when both exist: the fuller run.
      const verdict = manifest.gate
        ? { ...manifest.gate, lane: 'publish' as const }
        : manifest.previewGate
          ? { ...manifest.previewGate, lane: 'preview' as const }
          : null;
      // Frame precedence differs from verdict precedence: prefer whichever lane has a screenshot.
      const verdictScreenshot = manifest.gate?.screenshot ?? manifest.previewGate?.screenshot ?? null;

      const metadataBody = await gamesStore.getDerivedArtifact(slug, version, 'media/metadata.json');
      const media = parseGameMedia(metadataBody?.toString('utf8') ?? null);

      // Metadata-less runs expose the verdict screenshot as a fallback.
      const fallbackShot =
        !media && verdictScreenshot && /^media\/[a-z0-9][a-z0-9_.-]*\.png$/i.test(verdictScreenshot)
          ? verdictScreenshot.slice('media/'.length)
          : null;

      const screenshotFiles = media
        ? media.screenshots.map((shot) => ({ name: shot.name, file: shot.file }))
        : fallbackShot
          ? [{ name: 'opening', file: fallbackShot }]
          : [];
      const videoFile = media?.video ?? null;

      if (screenshotFiles.length === 0 && !videoFile) {
        return reply.send({
          available: false,
          deliveryId: version,
          reason: 'the gate stored no media for this delivery',
          access,
        });
      }

      const mediaObject = (file: string) => `games/${slug}/versions/${version}/media/${file}`;

      // Probe existence before signing — metadata can outlive a write failure.
      const probed = await Promise.all(
        screenshotFiles.map(async (shot) => ((await objectStore!.objectExists(mediaObject(shot.file))) ? shot : null)),
      );
      const storedShots = probed.filter((shot): shot is { name: string; file: string } => shot !== null);
      const storedVideo = videoFile && (await objectStore.objectExists(mediaObject(videoFile))) ? videoFile : null;

      if (storedShots.length === 0 && !storedVideo) {
        return reply.send({
          available: false,
          deliveryId: version,
          reason: 'the gate stored no media for this delivery',
          access,
        });
      }

      const screenshots = await Promise.all(
        storedShots.map(async (shot) => ({
          ...shot,
          url: await objectStore!.signReadUrl(mediaObject(shot.file), DEFAULT_SIGNED_URL_TTL_SECONDS),
        })),
      );
      const video = storedVideo
        ? {
            file: storedVideo,
            url: await objectStore.signReadUrl(mediaObject(storedVideo), DEFAULT_SIGNED_URL_TTL_SECONDS),
          }
        : null;

      // Bytes inline for URL-less clients; frames capped for context, not bandwidth.
      const requestedFrames = typeof query.frames === 'string' ? query.frames : 'opening';
      const frameMode: 'opening' | 'all' | 'none' =
        requestedFrames === 'all' || requestedFrames === 'none' ? requestedFrames : 'opening';

      const openingFirst = [
        ...storedShots.filter((shot) => shot.name === 'opening'),
        ...storedShots.filter((shot) => shot.name !== 'opening'),
      ];
      const wanted = frameMode === 'none' ? [] : frameMode === 'all' ? openingFirst : openingFirst.slice(0, 1);

      const frames: Array<{ file: string; name: string; png: string }> = [];
      let framesOmitted = 0;
      let inlineBytes = 0;
      for (const shot of wanted) {
        if (frames.length >= MAX_INLINE_FRAMES) {
          framesOmitted += 1;
          continue;
        }
        const body = await gamesStore.getDerivedArtifact(slug, version, `media/${shot.file}`).catch(() => null);
        // A bad or oversized frame is skipped, not fatal — signed URLs work.
        if (!body || body.length === 0 || body.length > maxShotBytes) {
          framesOmitted += 1;
          continue;
        }
        // First frame always fits: maxShotBytes is under the frame budget.
        if (inlineBytes + body.length > MAX_INLINE_FRAME_BYTES) {
          framesOmitted += 1;
          continue;
        }
        inlineBytes += body.length;
        frames.push({ file: shot.file, name: shot.name, png: body.toString('base64') });
      }

      return reply.send({
        available: true,
        deliveryId: version,
        ...(verdict
          ? {
              gate: {
                green: verdict.green,
                ranAt: verdict.ranAt,
                ...(verdict.status ? { status: verdict.status } : {}),
                // Lane on frames matters: a preview pass is not publish-readiness.
                lane: verdict.lane,
              },
            }
          : {}),
        screenshots,
        video,
        frames,
        ...(framesOmitted > 0 ? { framesOmitted } : {}),
        // Repeated in the payload for a client that cannot read tool docs.
        ...(video
          ? {
              videoNote:
                'The video is available only as a URL. If you cannot fetch URLs, do not try — ' +
                'give the link to the creator, who can open it, and describe the game from the frames.',
            }
          : {}),
        expiresInSeconds: DEFAULT_SIGNED_URL_TTL_SECONDS,
        access,
      });
    },
  );
}
