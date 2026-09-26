import type { Store } from './store.js';
import type { GamesStore } from '../delivery/games-store.js';
import { refuseUngatedShare } from '../delivery/draft-share-gate.js';
import { isReviewableCreatorDraft, loadReviewCandidate } from '../community/review-candidate.js';

export function createReviewPreviewLoader(store: Store, gamesStore?: GamesStore) {
  return async (slug: string, version: string) => {
    const record = await loadReviewCandidate(store, slug);
    if (!record || !isReviewableCreatorDraft(record) || (record.previewVersion ?? record.deliveredVersion) !== version)
      return null;
    if (await refuseUngatedShare({ gamesStore, slug, version, moderationBlockedAt: record.moderationBlockedAt }))
      return null;
    const bundle = await gamesStore!.getDerivedArtifact(slug, version, 'bundle.html');
    return bundle ? { slug, title: record.title || slug, html: bundle.toString('utf8') } : null;
  };
}
