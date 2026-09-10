import { describe, expect, it } from 'vitest';
import { createDreamJob, type DreamJobDeps, type DreamOutcome } from './dream-job.js';
import { createDreamAvailabilityGate } from './dream-availability.js';
import { StubDreamFrameGenerator, type DreamFrame } from './dream-frames.js';
import { StubNextIdeaGenerator, type NextIdea } from './next-ideas.js';
import { DREAM_FRAME_SHOT_LABEL, DREAM_SHOT_LABELS, DREAM_SOURCE_SHOT_LABEL } from '../platform/dream-shots.js';
import { InMemoryStore } from '../platform/store.js';
import { jpegHeader, pngHeader } from '../platform/image-size.test.js';
import type { SubmissionRecord } from '../store/records/submission.js';

const ideas: NextIdea[] = [
  { id: 'idea_0', label: { en: 'Night mode', pl: 'Tryb nocny' }, prompt: { en: 'Make it night.', pl: 'Zrób noc.' } },
  { id: 'idea_1', label: { en: 'More rocks', pl: 'Więcej skał' }, prompt: { en: 'Add rocks.', pl: 'Dodaj skały.' } },
  { id: 'idea_2', label: { en: 'Third', pl: 'Trzeci' }, prompt: { en: 'Third.', pl: 'Trzeci.' } },
];

const log = { error: () => {}, warn: () => {}, info: () => {} };

async function harness(params: {
  artifacts?: Record<string, Buffer | null>;
  frame?: DreamFrame | null | ((request: { direction: string }) => DreamFrame | null | Promise<DreamFrame | null>);
  ideas?: NextIdea[];
  hud?: unknown;
  record?: Partial<SubmissionRecord>;
  limits?: { dreamsPaused?: boolean; globalDailyDreamCap?: number };
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
    'media/opening.png': pngHeader(900, 900),
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
  const deps: DreamJobDeps = {
    store,
    gamesStore: { getDerivedArtifact: async (_slug, _version, name) => artifacts[name] ?? null },
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
    log,
    now: () => Date.parse('2026-09-07T12:00:00.000Z'),
    onPosted: (jobId) => posted.push(jobId),
  };
  const job = createDreamJob(deps);
  const run = (overrides: Partial<{ version: string; screenshotPath?: string }> = {}): Promise<DreamOutcome> =>
    job.runForVersion({ record, version: 'v1', screenshotPath: 'media/opening.png', ...overrides });
  return { store, record, frames, ideas: ideaGenerator, posted, run };
}

describe('createDreamJob', () => {
  it('refuses the idea call when the pause lands after the gate opened', async () => {
    const { store, ideas: generator, run } = await harness({ hud: [{ x: 16, y: 16, w: 200, h: 40 }] });
    const real = store.getCreationLimits.bind(store);
    let reads = 0;
    store.getCreationLimits = async () => {
      reads += 1;
      const stored = await real();
      // The operator pauses while the run reads the screenshot and HUD.
      return reads === 1 ? stored : { ...stored, dreamsPaused: true };
    };

    expect(await run()).toBe('paused');
    expect(generator.requests).toEqual([]);
    expect(await store.getGlobalDreamCount('2026-09-07')).toBe(0);
  });

  it('posts a two-option proposal with the real frame and two concept frames', async () => {
    const { store, frames, posted, run } = await harness({ hud: [{ x: 16, y: 16, w: 200, h: 40, label: 'score' }] });
    expect(await run()).toBe('posted');
    expect(frames.requests.map((r) => r.direction)).toEqual(['Make it night.', 'Add rocks.']);
    expect(frames.requests[0]?.hudRegions).toEqual([{ x: 16, y: 16, w: 200, h: 40 }]);
    expect(frames.requests[0]?.styleNote).toContain('"Parcel Run"');

    const shots = await store.listBuildShots(7);
    expect(shots.map((shot) => shot.label).sort()).toEqual([
      DREAM_FRAME_SHOT_LABEL,
      DREAM_FRAME_SHOT_LABEL,
      DREAM_SOURCE_SHOT_LABEL,
    ]);
    const [message] = await store.listCreatorMessages(7);
    expect(message?.origin).toBe('studio');
    expect(message?.deliveredAt).toBeTruthy();
    expect(message?.locale).toBe('pl');
    expect(message?.proposal?.version).toBe('v1');
    expect(message?.proposal?.options.map((option) => option.id)).toEqual(['idea_0', 'idea_1']);
    const source = shots.find((shot) => shot.label === DREAM_SOURCE_SHOT_LABEL);
    expect(message?.proposal?.sourceRef).toBe(source?.id);
    for (const option of message?.proposal?.options ?? []) {
      const shot = await store.getBuildShot(7, option.frameRef);
      expect(shot?.mediaType).toBe('image/jpeg');
    }
    expect(posted).toEqual([7]);
    expect(await store.getGlobalDreamCount('2026-09-07')).toBe(2);
    // Media strip and agent quota never see proposal shots.
    expect(await store.listBuildShots(7, { limit: 12, excludeLabels: DREAM_SHOT_LABELS })).toEqual([]);
    expect(await store.countBuildShots(7, { excludeLabels: DREAM_SHOT_LABELS })).toBe(0);
    expect(await store.countBuildShots(7)).toBe(3);
  });

  it('runs once per version, even when the first run produced nothing', async () => {
    const { store, run } = await harness({ hud: undefined });
    expect(await run()).toBe('no_hud');
    expect(await run()).toBe('already_ran');
    const refreshed = await store.getSubmission(7);
    expect(refreshed?.dreamRun?.version).toBe('v1');
    await store.setSubmissionPreviewVersion(7, 'v2');
    expect(await run({ version: 'v2' })).toBe('no_hud');
  });

  it('skips a delivery whose card was already posted, without touching the store', async () => {
    const { run, record } = await harness({});
    record.dreamRun = { version: 'v1', claimedAt: '2026-09-07T11:00:00.000Z', postedAt: '2026-09-07T11:01:00.000Z' };
    expect(await run()).toBe('already_ran');
  });

  it('leaves a claim alone while its worker could still be running', async () => {
    const { store, run } = await harness({ hud: [] });
    await store.claimDreamRun(7, 'v1', '2026-09-07T11:59:00.000Z');

    expect(await run()).toBe('already_ran');
  });

  it('marks a run finished even when it posted nothing, so it is not paid for twice', async () => {
    const { store, run, frames } = await harness({ hud: [], frame: null });

    expect(await run()).toBe('no_frames');
    expect(frames.requests).toHaveLength(2);
    // Without this the TTL would treat it as abandoned.
    expect((await store.getSubmission(7))?.dreamRun?.endedAt).toBeTruthy();
  });

  it('retakes a claim that never posted, so a failed write is not permanent', async () => {
    const { store, run } = await harness({ hud: [] });
    // Claimed an hour ago and no card: that worker is gone.
    await store.claimDreamRun(7, 'v1', '2026-09-07T11:00:00.000Z');

    expect(await run()).toBe('posted');
    expect(await store.listCreatorMessages(7)).toHaveLength(1);
  });

  it('is paused by the operator switch', async () => {
    const { store, run } = await harness({ hud: [], limits: { dreamsPaused: true } });
    expect(await run()).toBe('paused');
    expect(await store.listBuildShots(7)).toEqual([]);
  });

  it('stays quiet for a creator who asked for fewer proposals', async () => {
    const { store, run } = await harness({ hud: [] });
    await store.upsertUser({ uid: 'g:owner' });
    await store.setProposalsMuted('g:owner', '2026-09-01T00:00:00.000Z');
    expect(await run()).toBe('muted');
    expect(await store.listCreatorMessages(7)).toEqual([]);
  });

  it('refuses the idea call when the creator mutes mid-run', async () => {
    const { store, ideas: generator, run } = await harness({ hud: [] });
    await store.upsertUser({ uid: 'g:owner' });
    const real = store.getPublishedSubmissionBySlug.bind(store);
    store.getPublishedSubmissionBySlug = async (slug: string) => {
      // The creator opts out while the run reads the HUD.
      await store.setProposalsMuted('g:owner', '2026-09-07T12:00:00.000Z');
      return await real(slug);
    };

    expect(await run()).toBe('muted');
    expect(generator.requests).toEqual([]);
    expect(await store.listCreatorMessages(7)).toEqual([]);
  });

  it('posts no card when the creator mutes while the frames are drawn', async () => {
    let muteNow: (() => Promise<void>) | null = null;
    const { store, run } = await harness({
      hud: [],
      frame: async () => {
        await muteNow?.();
        return { data: jpegHeader(1024, 1024).toString('base64'), mediaType: 'image/jpeg' };
      },
    });
    await store.upsertUser({ uid: 'g:owner' });
    muteNow = async () => {
      muteNow = null;
      await store.setProposalsMuted('g:owner', '2026-09-07T12:00:00.000Z');
    };

    expect(await run()).toBe('muted');
    expect(await store.listCreatorMessages(7)).toEqual([]);
    expect(await store.listBuildShots(7)).toEqual([]);
  });

  it('refuses when the shared daily cap is spent', async () => {
    const { store, run } = await harness({ hud: [], limits: { globalDailyDreamCap: 0 } });
    expect(await run()).toBe('no_capacity');
    expect(await store.listCreatorMessages(7)).toEqual([]);
  });

  it('refuses when only one of the two frames would fit the cap', async () => {
    const { store, run } = await harness({ hud: [], limits: { globalDailyDreamCap: 1 } });
    expect(await run()).toBe('no_capacity');
    // Nothing spent: a lone frame is a paid call for nothing.
    expect(await store.getGlobalDreamCount('2026-09-07')).toBe(0);
    expect(await store.listCreatorMessages(7)).toEqual([]);
  });

  it('drops a proposal whose delivery moved while it was drawing', async () => {
    let deliverNewer: (() => Promise<void>) | null = null;
    const { store, run } = await harness({
      hud: [],
      frame: async () => {
        await deliverNewer?.();
        return { data: jpegHeader(1024, 1024).toString('base64'), mediaType: 'image/jpeg' };
      },
    });
    deliverNewer = async () => {
      await store.setSubmissionPreviewVersion(7, 'v2');
    };

    expect(await run()).toBe('superseded');
    expect(await store.listCreatorMessages(7)).toEqual([]);
    expect(await store.listBuildShots(7)).toEqual([]);
  });

  it('refuses to post once a newer delivery claims the job mid-write', async () => {
    const { store, run } = await harness({ hud: [] });
    const append = store.appendBuildShot.bind(store);
    let moved = false;
    // The frames are written first; the delivery can move in between.
    store.appendBuildShot = async (jobId, shot) => {
      const stored = await append(jobId, shot);
      if (!moved) {
        moved = true;
        await store.setSubmissionPreviewVersion(7, 'v2');
        await store.claimDreamRun(7, 'v2', '2026-09-07T12:00:01.000Z');
      }
      return stored;
    };

    expect(await run()).toBe('superseded');
    expect(await store.listCreatorMessages(7)).toEqual([]);
  });

  it('tells the idea model whether the game is already live', async () => {
    const draft = await harness({ hud: [] });
    expect(await draft.run()).toBe('posted');
    expect(draft.ideas.requests[0]?.published).toBe(false);

    const live = await harness({ hud: [], record: { publishedAt: '2026-08-01T00:00:00.000Z' } });
    expect(await live.run()).toBe('posted');
    expect(live.ideas.requests[0]?.published).toBe(true);
  });

  it('records the builder the card was drawn under', async () => {
    const { store, run } = await harness({ hud: [], record: { builder: 'self' } });
    expect(await run()).toBe('posted');
    expect((await store.listCreatorMessages(7))[0]?.proposal?.builder).toBe('self');
  });

  it('needs a real PNG capture to start from', async () => {
    expect(await (await harness({ hud: [] })).run({ screenshotPath: undefined })).toBe('no_screenshot');
    expect(await (await harness({ hud: [], artifacts: { 'media/opening.png': null } })).run()).toBe('no_screenshot');
    expect(await (await harness({ hud: [], artifacts: { 'media/opening.png': jpegHeader(9, 9) } })).run()).toBe(
      'no_screenshot',
    );
  });

  it('leaves a pure-UI game alone', async () => {
    const { run } = await harness({ hud: [{ x: 0, y: 0, w: 900, h: 700 }] });
    expect(await run()).toBe('pure_ui');
  });

  it('has nothing to say without a concept or ideas', async () => {
    expect(await (await harness({ hud: [], record: { spec: '' } })).run()).toBe('no_ideas');
    expect(await (await harness({ hud: [], ideas: [] })).run()).toBe('no_ideas');
  });

  it('refuses a claim for a delivery that is no longer current', async () => {
    // A worker can start after the round moved on.
    const { store } = await harness({ hud: [] });
    await store.setSubmissionPreviewVersion(7, 'v2');

    expect(await store.claimDreamRun(7, 'v1', '2026-09-09T00:00:00.000Z')).toBe(false);
    expect(await store.claimDreamRun(7, 'v2', '2026-09-09T00:00:00.000Z')).toBe(true);
  });

  it('spends nothing when the model returns a single idea', async () => {
    // A slot and an image call for a card that cannot post.
    const { store, run } = await harness({
      hud: [],
      ideas: [
        { id: 'idea_0', label: { en: 'Night', pl: 'Noc' }, prompt: { en: 'Make it night.', pl: 'Niech będzie noc.' } },
      ],
    });

    expect(await run()).toBe('no_ideas');
    expect(await store.listBuildShots(7)).toEqual([]);
  });

  it('posts nothing when only one frame survives', async () => {
    // The copy promises two directions; one is not a choice.
    const { store, run } = await harness({
      hud: [],
      frame: (request) =>
        request.direction === 'Make it night.'
          ? { data: jpegHeader(1024, 768).toString('base64'), mediaType: 'image/jpeg' }
          : { data: jpegHeader(512, 512).toString('base64'), mediaType: 'image/jpeg' },
    });
    expect(await run()).toBe('no_frames');
    expect(await store.listCreatorMessages(7)).toEqual([]);
  });

  it('posts nothing when no frame survives', async () => {
    const { store, run } = await harness({ hud: [], frame: null });
    expect(await run()).toBe('no_frames');
    expect(await store.listCreatorMessages(7)).toEqual([]);
    expect(await store.listBuildShots(7)).toEqual([]);
  });

  it('reports a crash as failed rather than throwing into the reconciler', async () => {
    const { run, store } = await harness({ hud: [] });
    store.appendBuildShot = async () => {
      throw new Error('quota');
    };
    expect(await run()).toBe('failed');
  });
});
