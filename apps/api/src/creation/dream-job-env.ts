import type { Store } from '../platform/store.js';
import { createDreamAvailabilityGate, type DreamAvailabilityGate } from './dream-availability.js';
import { VertexDreamFrameGenerator, type DreamFrameGenerator } from './dream-frames.js';
import { createDreamJob, type DreamJob, type DreamLog } from './dream-job.js';
import { createHudRegionsReader } from './hud-regions.js';
import { VertexNextIdeaGenerator, type NextIdeaGenerator } from './next-ideas.js';

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
    ideas: options.nextIdeaGenerator ?? new VertexNextIdeaGenerator(),
    frames: options.dreamFrameGenerator ?? new VertexDreamFrameGenerator(),
    readHudRegions: createHudRegionsReader(gamesStore),
    log: options.log,
    now: options.now,
    onPosted: options.onPosted,
  });
}
