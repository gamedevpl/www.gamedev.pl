import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogCard } from './ArcadeCatalog.js';
import type { CatalogEntry } from './catalog.js';
import { getRecentPlays } from './recentPlays.js';
import {
  fetchRecommendations,
  type RecommendationItem,
  type RecommendationReason,
} from './recommendationsApi.js';

type RecommendedCatalogProps = {
  catalogEntries: CatalogEntry[];
  catalogStatus: 'loading' | 'ready' | 'error';
  onPlayGame: (game: CatalogEntry) => void;
  onPlayTogether: (game: CatalogEntry) => void;
  /** Bump after a play so the rail can refresh affinity-driven picks. */
  refreshKey?: number;
};

function reasonMessage(reason: RecommendationReason, t: (key: string) => string): string {
  switch (reason) {
    case 'continue':
      return t('recommendations.reasonContinue');
    case 'for_you':
      return t('recommendations.reasonForYou');
    case 'because_you_played':
      return t('recommendations.reasonBecauseYouPlayed');
    default:
      return t('recommendations.reasonPopular');
  }
}

/**
 * Separate "For you" rail above the arcade. Does not reorder the main catalog —
 * that stays in games-repo order (docs/improvement-loop-plan.md / recommendations.md).
 */
export function RecommendedCatalog({
  catalogEntries,
  catalogStatus,
  onPlayGame,
  onPlayTogether,
  refreshKey = 0,
}: RecommendedCatalogProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<RecommendationItem[]>([]);

  useEffect(() => {
    if (catalogStatus !== 'ready' || catalogEntries.length === 0) {
      setItems([]);
      return;
    }
    let cancelled = false;
    void fetchRecommendations(getRecentPlays()).then((next) => {
      if (!cancelled) setItems(next);
    });
    return () => {
      cancelled = true;
    };
  }, [catalogStatus, catalogEntries, refreshKey]);

  const bySlug = new Map(catalogEntries.map((entry) => [entry.slug, entry]));
  const resolved = items
    .map((item) => {
      const entry = bySlug.get(item.slug);
      return entry ? { entry, reason: item.reason } : null;
    })
    .filter((row): row is { entry: CatalogEntry; reason: RecommendationReason } => row !== null);

  if (resolved.length === 0) return null;

  return (
    <section id="recommended" className="arcade-section recommended-section">
      <div className="arcade-header">
        <h2 className="arcade-title">{t('recommendations.title')}</h2>
        <p className="arcade-subtitle">{t('recommendations.subtitle')}</p>
      </div>
      <div className="catalog-grid">
        {resolved.map(({ entry, reason }) => (
          <CatalogCard
            key={entry.slug}
            entry={entry}
            onPlayGame={onPlayGame}
            onPlayTogether={onPlayTogether}
            reasonLabel={reasonMessage(reason, t)}
          />
        ))}
      </div>
    </section>
  );
}
