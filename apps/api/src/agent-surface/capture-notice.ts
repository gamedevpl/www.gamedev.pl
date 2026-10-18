import type { Store } from '../platform/store.js';
import type { SubmissionRecord } from '../store/records/submission.js';

const CAPTURE_PLAN_FILE = 'CAPTURE.json';

export const CAPTURE_NOTICE =
  'The creator asked for concept sketches, and they start from the gate’s gameplay screenshot. This game has no CAPTURE.json, so the gate takes none. In this round, write CAPTURE.json: a capture plan that gets past any title or menu into real play and then takes { "capture": "gameplay" } there.';

type NoticeStore = Pick<Store, 'getGameDreamsWantedAt'>;
type NoticeGamesStore = { getSourceFile(slug: string, version: string, path: string): Promise<string | null> };

// Derived each round, never stored: it goes quiet once the file exists.
export async function captureNoticeFor(
  store: NoticeStore | undefined,
  gamesStore: NoticeGamesStore | undefined,
  record: Pick<SubmissionRecord, 'slug' | 'previewVersion' | 'deliveredVersion'>,
): Promise<{ captureNotice?: string }> {
  if (!store || !record.slug) return {};
  try {
    if (!(await store.getGameDreamsWantedAt(record.slug))) return {};
    const version = record.previewVersion ?? record.deliveredVersion;
    if (version && gamesStore && (await gamesStore.getSourceFile(record.slug, version, CAPTURE_PLAN_FILE))) return {};
    return { captureNotice: CAPTURE_NOTICE };
  } catch {
    // Advisory: a read blip must not fail the round's start.
    return {};
  }
}
