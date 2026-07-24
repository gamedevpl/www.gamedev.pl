import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon, type PixelIconName } from './PixelIcon';
import { getSavedSpecs } from './mySpecs';
import { formatRelativeTime } from './relativeTime';
import { getSubmissionStatus, listMySubmissions, type SubmissionState } from './submissionApi';

/**
 * "Your games" on the home page. Before this existed, a creator who closed the tab
 * lost their build unless they had saved the tracking link by hand — the single most
 * common complaint about the creation flow. Ownership is server-side, so this also
 * works on a device that never held the link; locally saved specs are merged in so
 * an anonymous-era submission (or one made before the API listed it) still shows up.
 */

const STATUS_ICONS: Record<SubmissionState, PixelIconName> = {
  queued: 'clock',
  building: 'wrench',
  in_review: 'eye',
  publishing: 'rocket',
  published: 'star',
  needs_changes: 'pencil',
  abandoned: 'trash',
};

const LIVE_STATUSES = new Set<SubmissionState>(['queued', 'building', 'in_review', 'publishing']);
/** How many games get a live status fetch on load — one request each, so keep it small. */
const MAX_TRACKED = 6;
/** Refresh cadence for the rail. Slower than the status page: this is a glance, not a watch. */
const REFRESH_MS = 30_000;

type RailItem = {
  token: string;
  title: string;
  createdAt: number;
  status: SubmissionState | null;
  slug?: string;
};

type MyGamesRailProps = {
  /** Bumping this re-runs the fetch (e.g. right after a new submission). */
  refreshKey?: number;
  onOpenStatus: (token: string) => void;
  onPlayPublished: (slug: string) => void;
};

export function MyGamesRail({ refreshKey = 0, onOpenStatus, onPlayPublished }: MyGamesRailProps) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<RailItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Locally saved specs render instantly; the server list is authoritative and
      // merges in behind it. Either source alone is enough to show the rail.
      const local: RailItem[] = getSavedSpecs().map((spec) => ({
        token: spec.token,
        title: spec.title,
        createdAt: spec.createdAt,
        status: null,
      }));

      let merged = local;
      try {
        const remote = await listMySubmissions();
        const byToken = new Map(local.map((item) => [item.token, item]));
        for (const submission of remote) {
          const existing = byToken.get(submission.token);
          byToken.set(submission.token, {
            token: submission.token,
            title: existing?.title ?? submission.title,
            createdAt: existing?.createdAt ?? Date.parse(submission.createdAt),
            status: submission.lastKnownStatus,
          });
        }
        merged = [...byToken.values()];
      } catch {
        // Signed out, or the API is unreachable — the local list still stands.
      }

      merged.sort((a, b) => b.createdAt - a.createdAt);
      const visible = merged.slice(0, MAX_TRACKED);
      if (cancelled) return;
      setItems(visible);
      setLoading(false);

      // Resolve each game's real state. Failures leave the cheap hint in place.
      const resolved = await Promise.all(
        visible.map(async (item) => {
          try {
            const status = await getSubmissionStatus(item.token, i18n.language);
            return { ...item, status: status.status, slug: status.slug };
          } catch {
            return item;
          }
        }),
      );
      // A build the creator stopped is gone from their shelf, not greyed out on it.
      if (!cancelled) setItems(resolved.filter((item) => item.status !== 'abandoned'));
    }

    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [i18n.language, refreshKey]);

  const liveCount = useMemo(
    () => items.filter((item) => item.status !== null && LIVE_STATUSES.has(item.status)).length,
    [items],
  );

  if (loading || items.length === 0) {
    return null;
  }

  return (
    <section id="my-games" className="panel my-games-panel">
      <div className="section-header">
        <h2 className="section-title">
          <PixelIcon name="folder" size={18} /> {t('myGames.title')}
        </h2>
        {liveCount > 0 ? (
          <span className="status-live">
            <span className="live-dot" aria-hidden="true" />
            {t('myGames.liveCount', { count: liveCount })}
          </span>
        ) : null}
      </div>

      <ul className="my-games-list">
        {items.map((item) => {
          const status = item.status;
          const isPublished = status === 'published' && item.slug;
          const isLive = status !== null && LIVE_STATUSES.has(status);

          return (
            <li key={item.token} className={`my-game-card${isLive ? ' is-live' : ''}`}>
              <span className={`my-game-status my-game-status-${status ?? 'unknown'}`}>
                <PixelIcon name={status ? STATUS_ICONS[status] : 'clock'} size={12} />{' '}
                {status ? t(`statusView.states.${status}.label`) : t('myGames.checking')}
              </span>
              <h3 className="my-game-title">{item.title}</h3>
              <p className="my-game-meta">{formatRelativeTime(item.createdAt, i18n.language)}</p>
              <div className="my-game-actions">
                {isPublished ? (
                  <button className="primary-btn" onClick={() => onPlayPublished(item.slug!)}>
                    <PixelIcon name="play" size={12} /> {t('myGames.play')}
                  </button>
                ) : (
                  <button className="primary-btn" onClick={() => onOpenStatus(item.token)}>
                    <PixelIcon name="eye" size={12} /> {t('myGames.open')}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
