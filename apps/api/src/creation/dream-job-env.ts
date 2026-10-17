import type { Store } from '../platform/store.js';
import { createDreamAvailabilityGate, type DreamAvailabilityGate } from './dream-availability.js';
import { VertexDreamFrameGenerator, type DreamFrameGenerator } from './dream-frames.js';
import { createDreamJob, type DreamJob, type DreamLog } from './dream-job.js';
import { createHudRegionsReader } from './hud-regions.js';
import { NextIdeaModelGenerator, type NextIdeaGenerator } from './next-ideas.js';

export interface DreamJobEnvOptions {
  store?: Store;
  gamesStore?: {
    getDerivedArtifact(slug: string, version: string, name: string): Promise<Buffer | null>;
    getSourceFile(slug: string, version: string, path: string): Promise<string | null>;
  };
  log: DreamLog;
  now: () => number;
  dreamAvailabilityGate?: DreamAvailabilityGate;
  nextIdeaGenerator?: NextIdeaGenerator;
  dreamFrameGenerator?: DreamFrameGenerator;
  onPosted: (jobId: number) => void;
  env?: NodeJS.ProcessEnv;
}

// DREAMS_ENABLED=true turns the default on; tests never reach Vertex by accident.
export function createDreamJobFromEnv(options: DreamJobEnvOptions): DreamJob | null {
  const env = options.env ?? process.env;
  const { store, gamesStore } = options;
  if (!store || !gamesStore || env.DREAMS_ENABLED?.trim() !== 'true') return null;
  return createDreamJob({
    store,
    gamesStore,
    availability:
      options.dreamAvailabilityGate ??
      createDreamAvailabilityGate({
        store,
        logWarn: (payload, message) => options.log.warn(payload, message),
      }),
    ideas: options.nextIdeaGenerator ?? new NextIdeaModelGenerator(),
    frames: options.dreamFrameGenerator ?? new VertexDreamFrameGenerator(),
    readHudRegions: createHudRegionsReader(gamesStore),
    log: options.log,
    now: options.now,
    onPosted: options.onPosted,
  });
}

export interface DreamingEnabledEnvOptions {
  store?: Store;
  log: DreamLog;
  now: () => number;
  creationLimitsTtlMs?: number;
  dreamAvailabilityGate?: DreamAvailabilityGate;
  env?: NodeJS.ProcessEnv;
}

// Its own flag; the platform job would claim the version first.
export function createAgentProposalsEnabledFromEnv(options: DreamingEnabledEnvOptions): () => Promise<boolean> {
  const env = options.env ?? process.env;
  const { store } = options;
  if (!store || env.AGENT_PROPOSALS_ENABLED?.trim() !== 'true') return async () => false;
  const gate =
    options.dreamAvailabilityGate ??
    createDreamAvailabilityGate({
      store,
      logWarn: (payload, message) => options.log.warn(payload, message),
    });
  return () => gate.dreamingEnabled();
}

// MANAGED_VISUAL_TARGET=true: image frames for managed builders' visual_target.
export function createVisualTargetFromEnv(options: {
  store?: Store;
  log: DreamLog;
  env?: NodeJS.ProcessEnv;
}): { frames: DreamFrameGenerator; availability: DreamAvailabilityGate } | null {
  const env = options.env ?? process.env;
  if (!options.store || env.MANAGED_VISUAL_TARGET?.trim() !== 'true') return null;
  const availability = createDreamAvailabilityGate({
    store: options.store,
    logWarn: (payload, message) => options.log.warn(payload, message),
  });
  return { frames: new VertexDreamFrameGenerator(), availability };
}
