import { useTranslation } from 'react-i18next';
import type { RefObject } from 'react';
import { PixelIcon } from '../../PixelIcon.js';
import { formatRelativeTime } from '../../relativeTime.js';
import {
  isStudioGameShelfLive,
  studioGameInitials,
  STUDIO_LIVE_STATUSES,
  type StudioShelfFilter,
  type StudioShelfGame,
} from '../../studioShelf.js';

export function StudioShelfControls({
  searchInputId,
  searchRef,
  query,
  filter,
  showTools,
  buildingCount,
  liveCount,
  totalCount,
  onQueryChange,
  onFilterChange,
}: {
  searchInputId: string;
  searchRef?: RefObject<HTMLInputElement>;
  query: string;
  filter: StudioShelfFilter;
  showTools: boolean;
  buildingCount: number;
  liveCount: number;
  totalCount: number;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: StudioShelfFilter) => void;
}) {
  const { t } = useTranslation();
  if (!showTools) return null;

  return (
    <div className="studio-shelf-tools">
      <label className="studio-shelf-search" htmlFor={searchInputId}>
        <PixelIcon name="search" size={12} />
        <span className="studio-sr-only">{t('studioPanel.shelf.searchLabel')}</span>
        <input
          id={searchInputId}
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t('studioPanel.shelf.searchPlaceholder')}
          autoComplete="off"
        />
      </label>
      <div className="studio-shelf-filters" role="group" aria-label={t('studioPanel.shelf.filterAria')}>
        {(
          [
            ['all', t('studioPanel.shelf.filters.all'), totalCount],
            ['building', t('studioPanel.shelf.filters.building'), buildingCount],
            ['live', t('studioPanel.shelf.filters.live'), liveCount],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            className={`studio-shelf-filter${filter === id ? ' is-active' : ''}`}
            aria-pressed={filter === id}
            onClick={() => onFilterChange(id)}
          >
            {label}
            <span className="studio-shelf-filter-count">{count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function StudioShelfList({
  games,
  selected,
  locale,
  emptyLabel,
  onSelect,
}: {
  games: StudioShelfGame[];
  selected: string | null;
  locale: string;
  emptyLabel: string;
  onSelect: (token: string) => void;
}) {
  const { t } = useTranslation();

  if (games.length === 0) {
    return <p className="studio-shelf-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="studio-shelf-list">
      {games.map((game) => {
        const active = game.token === selected;
        const status = game.lastKnownStatus;
        const building = Boolean(status && STUDIO_LIVE_STATUSES.has(status));
        // Building wins the dot: a revise tip is still moving.
        const live = !building && isStudioGameShelfLive(game);
        return (
          <li key={game.token}>
            <button
              type="button"
              className={`studio-shelf-item${active ? ' is-active' : ''}${building ? ' is-live' : ''}${live ? ' is-published' : ''}`}
              onClick={() => onSelect(game.token)}
              aria-current={active ? 'true' : undefined}
              title={game.title}
            >
              <span
                className={`studio-shelf-mark${building ? ' is-live' : ''}${live ? ' is-published' : ''}`}
                aria-hidden="true"
              >
                {studioGameInitials(game.title)}
              </span>
              <span className="studio-shelf-title">{game.title}</span>
              <span className="studio-sr-only">
                {status ? t(`statusView.states.${status}.label`) : t('myGames.checking')} ·{' '}
                {formatRelativeTime(Date.parse(game.createdAt), locale)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
