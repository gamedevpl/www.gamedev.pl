import { assertAgentRound } from '../store/slices/agent-round-write.js';
import { createSeedRegenerator, type SeedRegenerationInput } from './seed-regeneration.js';
import { assembleGameHtml, projectFromSources } from '../platform/assemble.js';
import { MAX_BUILD_PREVIEW_BYTES } from '../platform/build-preview-limits.js';
import { overlayGameSources } from '../platform/game-overlay.js';
import type { AgentBackend, SeedDelivery } from '../agent-surface/agent-backend.js';
import type { GitHubClient } from '../catalog/github-client.js';
import type { GameSeeder, SeedDraft, SeedFile, SeedUsage } from './game-seed.js';
import type { SeedAvailabilityGate } from './seed-availability.js';
import type { BuilderKind } from './builder.js';
import type { Store, SubmissionRecord } from '../platform/store.js';

// Authored in both languages, not machine translated — one fixed sentence.
const SEED_PREVIEW_LABEL = 'First rough draft — the agent is improving it';
const SEED_PREVIEW_LABEL_PL = 'Pierwszy szkic gry — agent właśnie ją ulepsza';

export interface SeedPipelineOptions {
  store?: Store;
  now: () => number;
  gameSeeder?: GameSeeder;
  seedAvailabilityGate: SeedAvailabilityGate;
  builderOf: (record: SubmissionRecord | null | undefined) => BuilderKind;
  backendFor: (builder: BuilderKind | undefined) => Promise<AgentBackend | undefined>;
  githubClient: GitHubClient | null;
  publishedRef: string;
  // Regenerates inside a request (seed-dispatch.ts); false means run here.
  handoff?: (jobId: number, steer?: string, expectedRoundGeneration?: number) => Promise<boolean>;
  // Fired after the round-0 preview lands, to bust the media cache.
  onPreviewPublished?: (jobId: number) => void;
}

type SeedBuildResult = { draft: SeedDraft } | { draft?: undefined; reason: string; provider?: string };

type RegenerateSeedResult =
  | { ok: true; status: 'pending'; regenerationsRemaining: number }
  | {
      ok: false;
      reason:
        'not_configured' | 'not_found' | 'seed_not_readable' | 'already_delivered' | 'cap_reached' | 'seeding_off';
    };

export interface SeedPipeline {
  // A self round has no workspace, whatever a backend forgot to declare.
  seedDeliveryFor(backend: AgentBackend | undefined, builder: BuilderKind): SeedDelivery;
  seedBuild(input: {
    jobId: number;
    slug: string;
    spec: string;
    delivery: SeedDelivery;
    expectedRoundGeneration?: number;
    steer?: string;
    log: { error: (context: object, message: string) => void };
  }): Promise<SeedBuildResult>;
  // Queues a replacement draft, for rounds that read the job's copy.
  regenerateSeed(input: SeedRegenerationInput): Promise<RegenerateSeedResult>;
  publishSeedPreview(input: { jobId: number; slug: string; files: SeedFile[]; locale: string }): Promise<void>;
  // The work behind a pending regeneration; the seed route's entry.
  runSeedRegeneration(input: SeedRegenerationInput): Promise<void>;
}

// Round-0 draft generation, cost ledger, redo, and its preview.

// Generator lives in game-seed.ts; breaker in seed-availability.ts.
export function createSeedPipeline(options: SeedPipelineOptions): SeedPipeline {
  const { store, now, gameSeeder, seedAvailabilityGate, githubClient, publishedRef } = options;

  function seedDeliveryFor(backend: AgentBackend | undefined, builder: BuilderKind): SeedDelivery {
    return backend?.seedDelivery?.() ?? (builder === 'self' ? 'channel' : 'workspace');
  }

  // First ledger entry with real token counts, not just one credit.

  // Seed is billed by token via Vertex, unlike Copilot's flat session.
  async function recordSeedCost(
    jobId: number,
    usage: SeedUsage,
    log: { error: (context: object, message: string) => void },
    kind: 'seed' | 'seed_selection' = 'seed',
  ): Promise<void> {
    if (!store) return;
    try {
      await store.recordJobCost(jobId, {
        kind,
        at: new Date(now()).toISOString(),
        by: usage.model,
        tokens: { input: usage.inputTokens, output: usage.outputTokens },
        ...(usage.provider ? { provider: usage.provider } : {}),
      });
    } catch (error) {
      log.error({ err: error, jobId }, 'could not record the cost of a seed');
    }
  }

  // Only for builds starting a game — a revision restores delivered sources.

  // Slug already exists on the job by dispatch time — nothing to decide.
  async function seedBuild(input: {
    jobId: number;
    slug: string;
    spec: string;
    delivery: SeedDelivery;
    expectedRoundGeneration?: number;
    steer?: string;
    log: { error: (context: object, message: string) => void };
  }): Promise<SeedBuildResult> {
    if (!gameSeeder) return { reason: 'not_configured' };
    if (!store) return { reason: 'no_store' };
    // Checked before the paid call, so "off" costs nothing.
    if (!(await seedAvailabilityGate.seedingEnabled())) return { reason: 'seeding_off' };
    assertAgentRound((await store.getSubmission(input.jobId)) ?? undefined, input.expectedRoundGeneration);
    const seedDateStr = new Date(now()).toISOString().slice(0, 10);
    if (!(await seedAvailabilityGate.spendSeedSlot(seedDateStr))) return { reason: 'seeding_off' };
    // Resolved before the try so a failed attempt still names the vendor.
    const provider = await seedAvailabilityGate.resolveProvider();
    try {
      const record = await store.getSubmission(input.jobId);
      assertAgentRound(record ?? undefined, input.expectedRoundGeneration);
      if (!record) return { reason: 'job_not_found', provider };

      const draft = await gameSeeder.seed({
        slug: input.slug,
        title: record.title,
        spec: input.spec,
        provider,
        onReferenceFilterUsage: (usage) => recordSeedCost(input.jobId, usage, input.log, 'seed_selection'),
        ...(input.steer ? { steer: input.steer } : {}),
      });
      if (!draft) return { reason: 'seeder_declined', provider };

      await recordSeedCost(input.jobId, draft.usage, input.log);
      return { draft };
    } catch (error) {
      // Fail-open survives round 0 becoming mandatory; the caller records the failure.
      input.log.error({ err: error, jobId: input.jobId }, 'seeding failed, dispatching unseeded');
      return { reason: error instanceof Error ? `threw: ${error.message}` : 'threw', provider };
    }
  }

  const { regenerateSeed, runSeedRegeneration } = createSeedRegenerator(options, seedBuild, seedDeliveryFor);

  // Reuses the published-game serve path: CSP, provenance, credential scan.

  // Draft's files, not a git ref — the only copy that exists.

  // Lands in the same BuildPreview slot the agent's own pushes use.
  async function publishSeedPreview(input: {
    jobId: number;
    slug: string;
    files: SeedFile[];
    locale: string;
  }): Promise<void> {
    if (!store || !githubClient) return;
    const overlay = overlayGameSources({ seed: input.files });
    const sources = await githubClient.getGameSources(publishedRef, input.slug, overlay);
    if (!sources) return;
    const html = assembleGameHtml(projectFromSources(sources, sources.title ?? input.slug), { restrictNetwork: true });
    if (Buffer.byteLength(html, 'utf8') > MAX_BUILD_PREVIEW_BYTES) return;
    await store.appendBuildPreview(input.jobId, {
      data: Buffer.from(html, 'utf8').toString('base64'),
      slug: input.slug,
      // Provisional: the agent has not run yet.
      origin: 'seed',
      label: SEED_PREVIEW_LABEL,
      ...(input.locale.startsWith('pl') ? { labelLocalized: SEED_PREVIEW_LABEL_PL, locale: input.locale } : {}),
    });
    options.onPreviewPublished?.(input.jobId);
  }

  return { seedDeliveryFor, seedBuild, regenerateSeed, publishSeedPreview, runSeedRegeneration };
}
