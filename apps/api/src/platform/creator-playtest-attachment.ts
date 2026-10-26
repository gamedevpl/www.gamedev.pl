import type { Store } from './store.js';
import type { PlaytestFeedbackContext } from './playtest-context.js';
import { formatPlaytestContextBlock } from './playtest-context.js';
import { storeCreatorPlaytestShot, storeCreatorReferenceImages } from './creator-media-store.js';
import { savePlayJournal } from './play-journal.js';
import type { ChatAgentImage } from '../creation/chat-agent.js';

export async function prepareCreatorPlaytestAttachment(options: {
  store: Store | undefined;
  jobId: number;
  uid: string;
  context: PlaytestFeedbackContext | undefined;
  invalidateMedia: (jobId: number) => void;
  log: { error: (context: object, message: string) => void };
}) {
  const { store, jobId, uid, context, invalidateMedia, log } = options;
  let shotId: string | undefined;
  let referenceImageShotIds: string[] = [];
  let referenceImages: ChatAgentImage[] = [];
  if (store && context?.screenshotPng) {
    try {
      shotId = await storeCreatorPlaytestShot(store, jobId, context.screenshotPng);
      invalidateMedia(jobId);
    } catch (error) {
      log.error({ err: error }, 'failed to store creator playtest screenshot');
    }
  }
  if (store && context?.referenceImages?.length) {
    try {
      const stored = await storeCreatorReferenceImages(store, jobId, context.referenceImages);
      referenceImageShotIds = stored.ids;
      referenceImages = stored.images;
      invalidateMedia(jobId);
    } catch (error) {
      log.error({ err: error }, 'failed to store creator reference images');
    }
  }
  const playJournal =
    store && context?.playJournal ? await savePlayJournal(store, jobId, uid, context.playJournal) : undefined;
  return {
    shotId,
    referenceImageShotIds,
    referenceImages,
    playJournal,
    contextBlock: formatPlaytestContextBlock(context, shotId, referenceImageShotIds, playJournal?.id),
  };
}
