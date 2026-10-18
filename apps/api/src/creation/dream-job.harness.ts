import { createDreamJob, type DreamJobDeps, type DreamOutcome } from './dream-job.js';
import { createDreamAvailabilityGate } from './dream-availability.js';
import { StubDreamFrameGenerator, type DreamFrame } from './dream-frames.js';
import { StubNextIdeaGenerator, type NextIdea } from './next-ideas.js';
import { InMemoryStore } from '../platform/store.js';
import { encodePng } from '../platform/image-rgba.js';
import { jpegHeader } from '../platform/image-size.test.js';
import type { SubmissionRecord } from '../store/records/submission.js';

export const ideas: NextIdea[] = [
  { id: 'idea_0', label: { en: 'Night mode', pl: 'Tryb nocny' }, prompt: { en: 'Make it night.', pl: 'Zrób noc.' } },
  { id: 'idea_1', label: { en: 'More rocks', pl: 'Więcej skał' }, prompt: { en: 'Add rocks.', pl: 'Dodaj skały.' } },
  { id: 'idea_2', label: { en: 'Third', pl: 'Trzeci' }, prompt: { en: 'Third.', pl: 'Trzeci.' } },
];

export const log = { error: () => {}, warn: () => {}, info: () => {} };

export function capturingLog() {
  const errors: { context: object; message: string }[] = [];
  return { errors, log: { ...log, error: (context: object, message: string) => errors.push({ context, message }) } };
}

export async function harness(params: {
  artifacts?: Record<string, Buffer | null>;
  frame?: DreamFrame | null | ((request: { direction: string }) => DreamFrame | null | Promise<DreamFrame | null>);
  ideas?: NextIdea[];
  hud?: unknown;
  record?: Partial<SubmissionRecord>;
  limits?: { dreamsPaused?: boolean; globalDailyDreamCap?: number };
  log?: DreamJobDeps['log'];
  // Source files of the delivered version; a capture plan by default.
  sources?: Record<string, string | null>;
}) {
  const store = new InMemoryStore();
  if (params.limits) await store.setCreationLimits(params.limits, 'g:boss');
  const created = await store.createSubmission(7, 'g:owner', 'Parcel Run');
  // The claim needs the version to be current.
  await store.setSubmissionPreviewVersion(7, 'v1');
  const record: SubmissionRecord = {
    ...created,
    slug: 'parcel-run',
    spec: 'Deliver parcels between moons in a tiny rocket.',
    locale: 'pl',
    ...params.record,
  };
  const metadata = params.hud === undefined ? { frames: 3 } : { frames: 3, hud: params.hud };
  const artifacts: Record<string, Buffer | null> = {
    'media/opening.png': encodePng({ data: new Uint8ClampedArray(900 * 900 * 4).fill(120), width: 900, height: 900 }),
    'media/metadata.json': Buffer.from(JSON.stringify(metadata)),
    ...params.artifacts,
  };
  const ideaGenerator = new StubNextIdeaGenerator(params.ideas ?? ideas);
  const frames = new StubDreamFrameGenerator(
    params.frame === undefined
      ? { data: jpegHeader(1024, 1024).toString('base64'), mediaType: 'image/jpeg' }
      : params.frame,
  );
  const posted: number[] = [];
  const waits: number[] = [];
  const deps: DreamJobDeps = {
    store,
    gamesStore: {
      getDerivedArtifact: async (_slug, _version, name) => artifacts[name] ?? null,
      getSourceFile: async (_slug, _version, path) => ({ 'CAPTURE.json': '{}', ...params.sources })[path] ?? null,
    },
    availability: createDreamAvailabilityGate({ store }),
    ideas: ideaGenerator,
    frames,
    readHudRegions: async ({ slug, version, width, height }) => {
      const body = artifacts['media/metadata.json'];
      if (!body || slug !== 'parcel-run' || version !== 'v1') return null;
      const parsed = JSON.parse(body.toString()) as { hud?: unknown };
      if (!Array.isArray(parsed.hud)) return null;
      return (parsed.hud as { x: number; y: number; w: number; h: number }[]).map((r) => ({
        x: Math.min(r.x, width),
        y: Math.min(r.y, height),
        w: r.w,
        h: r.h,
      }));
    },
    log: params.log ?? log,
    now: () => Date.parse('2026-09-07T12:00:00.000Z'),
    // Never a real timer: the cleanup backoff would hold the suite.
    wait: async (ms) => {
      waits.push(ms);
    },
    onPosted: (jobId) => posted.push(jobId),
  };
  const job = createDreamJob(deps);
  const run = (overrides: Partial<{ version: string; screenshotPath?: string }> = {}): Promise<DreamOutcome> =>
    job.runForVersion({ record, version: 'v1', screenshotPath: 'media/opening.png', ...overrides });
  return { store, record, job, frames, ideas: ideaGenerator, posted, waits, run };
}
