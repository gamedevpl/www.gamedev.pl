import { assertAgentRound } from '../store/slices/agent-round-write.js';
import type { SeedPipeline, SeedPipelineOptions } from './seed-pipeline.js';

export interface SeedRegenerationInput {
  jobId: number;
  steer?: string;
  expectedRoundGeneration?: number;
  log: { error: (context: object, message: string) => void; info?: (context: object, message: string) => void };
}

export function createSeedRegenerator(
  options: SeedPipelineOptions,
  seedBuild: SeedPipeline['seedBuild'],
  seedDeliveryFor: SeedPipeline['seedDeliveryFor'],
): Pick<SeedPipeline, 'regenerateSeed' | 'runSeedRegeneration'> {
  const { store, gameSeeder, seedAvailabilityGate, builderOf, backendFor } = options;
  const MAX_SEED_REGENERATIONS = 2;
  async function regenerateSeed(input: SeedRegenerationInput): ReturnType<SeedPipeline['regenerateSeed']> {
    if (!gameSeeder || !store) return { ok: false, reason: 'not_configured' };
    const record = await store.getSubmission(input.jobId);
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

    const generation = input.expectedRoundGeneration ?? record.roundGeneration ?? 1;
    const used = await store.incrementSeedRegenerations(input.jobId, generation);
    if (used > MAX_SEED_REGENERATIONS) return { ok: false, reason: 'cap_reached' };

    await store.setSeedStatus(input.jobId, 'pending', generation);
    const accepted = options.handoff
      ? await options.handoff(input.jobId, input.steer, generation).catch(() => false)
      : false;
    if (!accepted) {
      void runSeedRegeneration({ ...input, expectedRoundGeneration: generation }).catch((error) => {
        input.log.error({ err: error, jobId: input.jobId }, 'seed regeneration failed');
      });
    }

    return { ok: true, status: 'pending', regenerationsRemaining: MAX_SEED_REGENERATIONS - used };
  }

  async function runSeedRegeneration(input: SeedRegenerationInput): Promise<void> {
    if (!store) return;
    const record = await store.getSubmission(input.jobId);
    assertAgentRound(record ?? undefined, input.expectedRoundGeneration);
    if (!record?.slug) return;
    const { draft } = await seedBuild({
      jobId: input.jobId,
      slug: record.slug,
      spec: record.spec ?? '',
      delivery: 'channel',
      expectedRoundGeneration: input.expectedRoundGeneration,
      ...(input.steer ? { steer: input.steer } : {}),
      log: input.log,
    });
    if (draft) {
      await store.setSubmissionSeed(
        input.jobId,
        {
          slug: draft.slug,
          files: draft.files,
          references: draft.references,
          ...(draft.notes ? { notes: draft.notes } : {}),
        },
        input.expectedRoundGeneration,
      );
    } else {
      await store.setSeedStatus(input.jobId, 'unavailable', input.expectedRoundGeneration);
    }
  }

  return { regenerateSeed, runSeedRegeneration };
}
