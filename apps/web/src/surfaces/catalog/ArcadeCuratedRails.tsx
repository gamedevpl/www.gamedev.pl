import { useTranslation } from 'react-i18next';
import { type CatalogEntry } from '../../catalog.js';
import { CatalogRail, FeaturedGame } from './CatalogRail.js';
import type { PlayVia } from '../../visitTelemetry.js';

// The featured card and the four fixed rails above the grid.
export function ArcadeCuratedRails({
  featuredEntry,
  featuredMoreLikeThis,
  startHereEntries,
  continuePlayingEntries,
  partyEntries,
  recentlyAddedEntries,
  onPlayGame,
  onPlayTogether,
}: {
  featuredEntry: CatalogEntry | null;
  featuredMoreLikeThis: CatalogEntry[];
  startHereEntries: CatalogEntry[];
  continuePlayingEntries: CatalogEntry[];
  partyEntries: CatalogEntry[];
  recentlyAddedEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  onPlayTogether: (game: CatalogEntry, via?: PlayVia) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {featuredEntry && (
        <div id="play-anchor">
          <FeaturedGame
            entry={featuredEntry}
            onPlayGame={onPlayGame}
            onPlayTogether={onPlayTogether}
            moreLikeThis={featuredMoreLikeThis}
          />
        </div>
      )}
      <CatalogRail
        heading={t('catalog.rails.startHere')}
        entries={startHereEntries}
        via="rail_start_here"
        onPlayGame={onPlayGame}
      />
      <CatalogRail
        heading={t('catalog.rails.continuePlaying')}
        entries={continuePlayingEntries}
        via="rail_continue"
        onPlayGame={onPlayGame}
      />
      <CatalogRail
        id="party-rail"
        heading={t('catalog.rails.party')}
        entries={partyEntries}
        via="rail_party"
        onPlayGame={onPlayGame}
        onPlayTogether={onPlayTogether}
        headingAside={partyEntries.length > 0 ? String(partyEntries.length) : undefined}
      />
      <CatalogRail
        heading={t('catalog.rails.recentlyAdded')}
        entries={recentlyAddedEntries}
        via="rail_new"
        onPlayGame={onPlayGame}
      />
    </>
  );
}
