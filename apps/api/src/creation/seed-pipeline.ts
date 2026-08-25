import { assembleGameHtml } from '../platform/assemble.js';
import { MAX_BUILD_PREVIEW_BYTES } from '../delivery/build-preview-limits.js';
import { overlayGameSources } from '../delivery/staged-preview.js';
import type { AgentBackend, SeedDelivery } from '../agent-surface/agent-backend.js';
import type { GitHubClient } from '../catalog/github-client.js';
import type { GameSeeder, SeedDraft, SeedFile } from './game-seed.js';
import type { SeedAvailabilityGate } from './seed-availability.js';
import type { BuilderKind } from './builder.js';
import type { Store, SubmissionRecord } from '../platform/store.js';

// Each regeneration is a paid generation, so this is a spend ceiling.
const MAX_SEED_REGENERATIONS = 2;

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
    issueNumber: number;
    slug: string;
    spec: string;
    delivery: SeedDelivery;
    steer?: string;
    log: { error: (context: object, message: string) => void };
  }): Promise<SeedBuildResult>;
  // Queues a replacement draft, for rounds that read the job's copy.
  regenerateSeed(input: {
    issueNumber: number;
    steer?: string;
    log: { error: (context: object, message: string) => void; info?: (context: object, message: string) => void };
  }): Promise<RegenerateSeedResult>;
  publishSeedPreview(input: { issueNumber: number; slug: string; files: SeedFile[]; locale: string }): Promise<void>;
}

// Round-0 draft generation, cost ledger, redo, and its preview.

// Generator lives in game-seed.ts; breaker in seed-availability.ts.
export function createSeedPipeline(options: SeedPipelineOptions): SeedPipeline {
  const { store, now, gameSeeder, seedAvailabilityGate, builderOf, backendFor, githubClient, publishedRef } = options;

  function seedDeliveryFor(backend: AgentBackend | undefined, builder: BuilderKind): SeedDelivery {
    return backend?.seedDelivery?.() ?? (builder === 'self' ? 'channel' : 'workspace');
  }

  // First ledger entry with real token counts, not just one credit.

  // Seed is billed by token via Vertex, unlike Copilot's flat session.
  async function recordSeedCost(
    issueNumber: number,
    draft: SeedDraft,
    log: { error: (context: object, message: string) => void },
  ): Promise<void> {
    if (!store) return;
    try {
      await store.recordJobCost(issueNumber, {
        kind: 'seed',
        at: new Date(now()).toISOString(),
        by: draft.usage.model,
        tokens: { input: draft.usage.inputTokens, output: draft.usage.outputTokens },
        ...(draft.usage.provider ? { provider: draft.usage.provider } : {}),
      });
    } catch (error) {
      log.error({ err: error, issueNumber }, 'could not record the cost of a seed');
    }
  }

  // Only for builds starting a game — a revision restores delivered sources.

  // Slug already exists on the job by dispatch time — nothing to decide.
  async function seedBuild(input: {
    issueNumber: number;
    slug: string;
    spec: string;
    delivery: SeedDelivery;
    steer?: string;
    log: { error: (context: object, message: string) => void };
  }): Promise<SeedBuildResult> {
    if (!gameSeeder) return { reason: 'not_configured' };
    if (!store) return { reason: 'no_store' };
    // Checked before the paid call, so "off" costs nothing.
    if (!(await seedAvailabilityGate.seedingEnabled())) return { reason: 'seeding_off' };
    // Resolved before the try so a failed attempt still names the vendor.
    const provider = await seedAvailabilityGate.resolveProvider();
    try {
      const record = await store.getSubmission(input.issueNumber);
      if (!record) return { reason: 'job_not_found', provider };

      const draft = await gameSeeder.seed({
        slug: input.slug,
        title: record.title,
        spec: input.spec,
        provider,
        ...(input.steer ? { steer: input.steer } : {}),
      });
      if (!draft) return { reason: 'seeder_declined', provider };

      await recordSeedCost(input.issueNumber, draft, input.log);
      return { draft };
    } catch (error) {
      // Fail-open survives round 0 becoming mandatory; the caller records the failure.
      input.log.error({ err: error, issueNumber: input.issueNumber }, 'seeding failed, dispatching unseeded');
      return { reason: error instanceof Error ? `threw: ${error.message}` : 'threw', provider };
    }
  }

  async function regenerateSeed(input: {
    issueNumber: number;
    steer?: string;
    log: { error: (context: object, message: string) => void; info?: (context: object, message: string) => void };
  }): Promise<RegenerateSeedResult> {
    if (!gameSeeder || !store) return { ok: false, reason: 'not_configured' };
    const record = await store.getSubmission(input.issueNumber);
    if (!record || !record.slug) return { ok: false, reason: 'not_found' };
    // A workspace round already forked; a rewrite cannot catch up.
    const roundBuilder = builderOf(record);
    if (seedDeliveryFor(await backendFor(roundBuilder), roundBuilder) !== 'channel') {
      return { ok: false, reason: 'seed_not_readable' };
    }
    // A delivered round was already judged; do not move its starting point.
    if ((record.roundDeliveryCount ?? 0) > 0) return { ok: false, reason: 'already_delivered' };
    // Checked before spending quota, which never resets when seeding comes back on.
    if (!(await seedAvailabilityGate.seedingEnabled())) return { ok: false, reason: 'seeding_off' };

    const used = await store.incrementSeedRegenerations(input.issueNumber);
    if (used > MAX_SEED_REGENERATIONS) return { ok: false, reason: 'cap_reached' };

    await store.setSeedStatus(input.issueNumber, 'pending');
    const slug = record.slug;
    void (async () => {
      const { draft } = await seedBuild({
        issueNumber: input.issueNumber,
        slug,
        spec: record.spec ?? '',
        delivery: 'channel',
        ...(input.steer ? { steer: input.steer } : {}),
        log: input.log,
      });
      if (draft) {
        await store!.setSubmissionSeed(input.issueNumber, {
          slug: draft.slug,
          files: draft.files,
          references: draft.references,
          ...(draft.notes ? { notes: draft.notes } : {}),
        });
      } else {
        await store!.setSeedStatus(input.issueNumber, 'unavailable');
      }
    })().catch((error) => {
      input.log.error({ err: error, issueNumber: input.issueNumber }, 'seed regeneration failed');
    });

    return { ok: true, status: 'pending', regenerationsRemaining: MAX_SEED_REGENERATIONS - used };
  }

  // Reuses the published-game serve path: CSP, provenance, credential scan.

  // Draft's files, not a git ref — the only copy that exists.

  // Lands in the same BuildPreview slot the agent's own pushes use.
  async function publishSeedPreview(input: {
    issueNumber: number;
    slug: string;
    files: SeedFile[];
    locale: string;
  }): Promise<void> {
    if (!store || !githubClient) return;
    const overlay = overlayGameSources({ seed: input.files });
    const sources = await githubClient.getGameSources(publishedRef, input.slug, overlay);
    if (!sources) return;
    const html = assembleGameHtml(
      {
        title: sources.title ?? input.slug,
        description: '',
        html: sources.indexHtml,
        js: sources.gameJs,
        css: sources.styleCss,
      },
      { restrictNetwork: true },
    );
    if (Buffer.byteLength(html, 'utf8') > MAX_BUILD_PREVIEW_BYTES) return;
    await store.appendBuildPreview(input.issueNumber, {
      data: Buffer.from(html, 'utf8').toString('base64'),
      slug: input.slug,
      // Provisional: the agent has not run yet.
      origin: 'seed',
      label: SEED_PREVIEW_LABEL,
      ...(input.locale.startsWith('pl') ? { labelLocalized: SEED_PREVIEW_LABEL_PL, locale: input.locale } : {}),
    });
  }

  return { seedDeliveryFor, seedBuild, regenerateSeed, publishSeedPreview };
}
