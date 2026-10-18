import { describe, expect, it } from 'vitest';
import { harness } from './dream-job.harness.js';
import { DREAMS_OFFER_TEXT_EN, DREAMS_OFFER_TEXT_PL } from './dream-offer.js';

describe('dream job without a capture plan', () => {
  it('asks the owner once instead of failing quietly', async () => {
    const { store, ideas, run } = await harness({ hud: [], sources: { 'CAPTURE.json': null } });
    expect(await run({ screenshotPath: undefined })).toBe('no_capture');
    expect(ideas.requests).toEqual([]);
    const messages = await store.listCreatorMessages(7);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      text: DREAMS_OFFER_TEXT_EN,
      textLocalized: DREAMS_OFFER_TEXT_PL,
      origin: 'studio',
      dreamsOffer: true,
    });
    expect(messages[0]!.deliveredAt).not.toBeNull();

    // A later delivery of the same game is not asked again.
    await store.setSubmissionPreviewVersion(7, 'v2');
    expect(await run({ version: 'v2', screenshotPath: undefined })).toBe('no_capture');
    expect(await store.listCreatorMessages(7)).toHaveLength(1);
  });

  it('stays quiet once the owner said yes or turned sketches off', async () => {
    const wanted = await harness({ hud: [], sources: { 'CAPTURE.json': null } });
    await wanted.store.setGameDreamsWantedAt('parcel-run', '2026-09-07T00:00:00.000Z');
    expect(await wanted.run({ screenshotPath: undefined })).toBe('no_capture');
    expect(await wanted.store.listCreatorMessages(7)).toEqual([]);

    const off = await harness({ hud: [], sources: { 'CAPTURE.json': null } });
    await off.store.setGameDreamsOffAt('parcel-run', '2026-09-07T00:00:00.000Z');
    expect(await off.run({ screenshotPath: undefined })).toBe('muted');
    expect(await off.store.listCreatorMessages(7)).toEqual([]);
  });

  it('keeps no_screenshot for a plan that captured nothing', async () => {
    const { store, run } = await harness({ hud: [] });
    expect(await run({ screenshotPath: undefined })).toBe('no_screenshot');
    expect(await store.listCreatorMessages(7)).toEqual([]);
  });
});
