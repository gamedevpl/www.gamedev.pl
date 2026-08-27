// The one meaning of "published" for a game in the publication registry.

// `archived` and `disabled` both mean "was published, is not live now".

import type { PublicationRecord } from '../delivery/games-store.js';

type PublicationLike = Pick<PublicationRecord, 'state'>;

// A type guard, so callers keep the narrowing they had.
export function isPublished<T extends PublicationLike>(
  publication: T | null | undefined,
): publication is T & { state: 'published' } {
  return publication?.state === 'published';
}

// The live version, or null when the slug is not published.
export function publishedVersion(
  publication: (PublicationLike & Pick<PublicationRecord, 'currentVersion'>) | null | undefined,
): string | null {
  return isPublished(publication) ? publication.currentVersion : null;
}
