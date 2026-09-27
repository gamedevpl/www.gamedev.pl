import type { GameTheaterSource } from '../../GameTheater.js';
import type { ReviewQueueItem } from './reviewApi.js';

export function reviewGameSource(item: ReviewQueueItem): GameTheaterSource {
  return item.source === 'creator' && item.gameVersion
    ? { slug: item.slug, reviewVersion: item.gameVersion }
    : { slug: item.slug };
}
