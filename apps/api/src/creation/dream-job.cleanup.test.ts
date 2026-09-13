import { describe, expect, it } from 'vitest';
import { capturingLog, harness } from './dream-job.harness.js';

describe('createDreamJob shot cleanup', () => {
  it('removes the shots it wrote when a later one fails', async () => {
    const { store, run } = await harness({ hud: [] });
    const real = store.appendBuildShot.bind(store);
    let writes = 0;
    store.appendBuildShot = async (jobId, shot) => {
      writes += 1;
      if (writes === 3) throw new Error('firestore unavailable');
      return await real(jobId, shot);
    };

    expect(await run()).toBe('failed');
    expect(await store.countBuildShots(7)).toBe(0);
    expect(await store.listCreatorMessages(7)).toEqual([]);
  });

  it('retries a cleanup that failed, so a blip does not strand the shots', async () => {
    const { store, run } = await harness({ hud: [] });
    const append = store.appendBuildShot.bind(store);
    const remove = store.deleteBuildShots.bind(store);
    let writes = 0;
    store.appendBuildShot = async (jobId, shot) => {
      writes += 1;
      if (writes === 3) throw new Error('firestore unavailable');
      return await append(jobId, shot);
    };
    let deletes = 0;
    store.deleteBuildShots = async (jobId, ids) => {
      deletes += 1;
      if (deletes === 1) throw new Error('firestore unavailable');
      return await remove(jobId, ids);
    };

    expect(await run()).toBe('failed');
    expect(deletes).toBe(2);
    expect(await store.countBuildShots(7)).toBe(0);
  });

  it('names the ids it could not delete, since nothing sweeps after it', async () => {
    const { errors, log: capturing } = capturingLog();
    const { store, run } = await harness({ hud: [], log: capturing });
    const append = store.appendBuildShot.bind(store);
    let writes = 0;
    store.appendBuildShot = async (jobId, shot) => {
      writes += 1;
      if (writes === 3) throw new Error('firestore unavailable');
      return await append(jobId, shot);
    };
    store.deleteBuildShots = async () => {
      throw new Error('firestore unavailable');
    };

    expect(await run()).toBe('failed');
    const orphaned = errors.find((entry) => entry.message.includes('orphaned'));
    // The third id counts: its write may have landed anyway.
    expect((orphaned?.context as { shots?: string[] })?.shots).toHaveLength(3);
    expect(await store.countBuildShots(7)).toBe(2);
  });

  it('deletes a shot whose write answered with an error after committing', async () => {
    const { store, run } = await harness({ hud: [] });
    const append = store.appendBuildShot.bind(store);
    let writes = 0;
    store.appendBuildShot = async (jobId, shot) => {
      writes += 1;
      // The row lands, then the response is lost on the way back.
      const stored = await append(jobId, shot);
      if (writes === 2) throw new Error('connection reset');
      return stored;
    };

    expect(await run()).toBe('failed');
    // Both rows committed, so both must be gone.
    expect(await store.countBuildShots(7)).toBe(0);
  });

  it('keeps the frames when the card landed but the answer did not', async () => {
    const { errors, log: capturing } = capturingLog();
    const { store, run } = await harness({ hud: [], log: capturing });
    const real = store.appendProposalMessage.bind(store);
    store.appendProposalMessage = async (jobId, claim, text, opts) => {
      // The card commits, then the response is lost on the way back.
      await real(jobId, claim, text, opts);
      throw new Error('connection reset');
    };

    expect(await run()).toBe('posted');
    // The card is on the thread; its frames must survive.
    expect(await store.listCreatorMessages(7)).toHaveLength(1);
    expect(await store.countBuildShots(7)).toBe(3);
    // Logging live frames is an instruction to break the card.
    expect(errors).toEqual([]);
  });

  it('keeps the frames when a transaction retry sees its own stamp', async () => {
    const { store, run } = await harness({ hud: [] });
    const real = store.appendProposalMessage.bind(store);
    store.appendProposalMessage = async (jobId, claim, text, opts) => {
      // The commit landed; the retry re-reads and refuses its own card.
      await real(jobId, claim, text, opts);
      return null;
    };

    expect(await run()).toBe('posted');
    expect(await store.listCreatorMessages(7)).toHaveLength(1);
    expect(await store.countBuildShots(7)).toBe(3);
  });

  it('leaves the frames alone when it cannot read whether the card landed', async () => {
    const { errors, log: capturing } = capturingLog();
    const { store, run } = await harness({ hud: [], log: capturing });
    const append = store.appendBuildShot.bind(store);
    const read = store.getSubmission.bind(store);
    let writes = 0;
    store.appendBuildShot = async (jobId, shot) => {
      writes += 1;
      const stored = await append(jobId, shot);
      if (writes === 3) throw new Error('firestore unavailable');
      return stored;
    };
    // Reads work until the writes begin, then the outage takes them too.
    store.getSubmission = async (jobId) => {
      if (writes > 0) throw new Error('firestore unavailable');
      return await read(jobId);
    };

    expect(await run()).toBe('failed');
    // A read that never answered must not condemn these rows.
    expect(await store.countBuildShots(7)).toBe(3);
    expect(errors.some((entry) => entry.message.includes('orphaned'))).toBe(true);
  });

  it('keeps the frames when a newer delivery claims the job before the look back', async () => {
    const { errors, log: capturing } = capturingLog();
    const { store, run } = await harness({ hud: [], log: capturing });
    const real = store.appendProposalMessage.bind(store);
    store.appendProposalMessage = async (jobId, claim, text, opts) => {
      await real(jobId, claim, text, opts);
      // The answer is lost, and a green preview claims the job meanwhile.
      await store.setSubmissionPreviewVersion(7, 'v2');
      await store.claimDreamRun(7, 'v2', '2026-09-07T12:05:00.000Z', 1);
      throw new Error('connection reset');
    };

    expect(await run()).toBe('posted');
    // The claim that carried `postedAt` is gone; the card is not.
    expect((await store.getSubmission(7))?.dreamRun?.version).toBe('v2');
    expect(await store.listCreatorMessages(7)).toHaveLength(1);
    expect(await store.countBuildShots(7)).toBe(3);
    expect(errors).toEqual([]);
  });
});
