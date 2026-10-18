import type { Store } from '../platform/store.js';
import type { SubmissionRecord } from '../store/records/submission.js';

// The gate's capture plan; sketches start from its still.
export const CAPTURE_PLAN_FILE = 'CAPTURE.json';

export const DREAMS_OFFER_TEXT_EN =
  'I can sketch two directions for this game after each round, but it has no gameplay screenshot to start from yet. Want me to set that up in the next round?';
export const DREAMS_OFFER_TEXT_PL =
  'Po każdej rundzie mogę szkicować dwa kierunki rozwoju tej gry, ale nie ma jeszcze zrzutu rozgrywki, od którego mógłbym zacząć. Przygotować go w następnej rundzie?';

type OfferStore = Pick<
  Store,
  'getGameDreamsWantedAt' | 'getGameDreamsOffAt' | 'claimGameDreamsOffer' | 'appendCreatorMessage'
>;

// Asks once per game; a yes is the builder's cue.
export async function offerDreamsSetup(store: OfferStore, record: SubmissionRecord, at: string): Promise<boolean> {
  if (!record.slug) return false;
  if (await store.getGameDreamsWantedAt(record.slug)) return false;
  if (await store.getGameDreamsOffAt(record.slug)) return false;
  if (!(await store.claimGameDreamsOffer(record.slug, at))) return false;
  try {
    await store.appendCreatorMessage(record.jobId, DREAMS_OFFER_TEXT_EN, {
      origin: 'studio',
      delivered: true,
      textLocalized: DREAMS_OFFER_TEXT_PL,
      locale: 'pl',
      dreamsOffer: true,
    });
  } catch (error) {
    // A claim without its card would silence the question for good.
    await store.claimGameDreamsOffer(record.slug, null).catch(() => {});
    throw error;
  }
  return true;
}
