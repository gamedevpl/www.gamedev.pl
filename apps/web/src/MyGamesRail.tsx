import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelIcon, type PixelIconName } from './PixelIcon.js';
import { getSavedSpecs } from './mySpecs.js';
import { formatRelativeTime } from './relativeTime.js';
import { getSubmissionStatus, listMySubmissions, type SubmissionState } from './submissionApi.js';

/**
 * "Your games" on the home page. Before this existed, a creator who closed the tab
 * lost their build unless they had saved the tracking link by hand — the single most
 * common complaint about the creation flow. Ownership is server-side, so this also
 * works on a device that never held the link; locally saved specs are merged in so
 * an anonymous-era submission (or one made before the API listed it) still shows up.
 *
 * The whole rail costs exactly one request. It used to take the list and then derive
 * every card's status individually, six in parallel every thirty seconds — each of
 * those a couple of GitHub reads against one shared token. A single creator with a
 * few builds open was enough to trip GitHub's rate limit, which took out the status
 * page and the catalog with it. The statuses now come from the store, kept current
 * by the two-minute notify sweep: a glance can be two minutes old, and the status
 * page is still live to the second for the build actually being watched.
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
/** How many games the home-page gist shows. Full shelf lives in Creator Studio. */
const MAX_TRACKED = 4;
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
  /** Opens the full creator control panel. */
  onOpenStudio?: () => void;
};

export function MyGamesRail({ refreshKey = 0, onOpenStatus, onPlayPublished, onOpenStudio }: MyGamesRailProps) {
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
      const listedByServer = new Set<string>();
      try {
        const remote = await listMySubmissions();
        const byToken = new Map(local.map((item) => [item.token, item]));
        for (const submission of remote) {
          const existing = byToken.get(submission.token);
          listedByServer.add(submission.token);
          byToken.set(submission.token, {
            token: submission.token,
            title: existing?.title ?? submission.title,
            createdAt: existing?.createdAt ?? Date.parse(submission.createdAt),
            status: submission.lastKnownStatus,
            slug: submission.slug ?? undefined,
          });
        }
        merged = [...byToken.values()];
      } catch {
        // Signed out, or the API is unreachable — the local list still stands.
      }

      merged.sort((a, b) => b.createdAt - a.createdAt);
      // A build the creator stopped is gone from their shelf, not greyed out on it.
      // (The API already omits them; this covers a locally saved spec.)
      const visible = merged.filter((item) => item.status !== 'abandoned').slice(0, MAX_TRACKED);
      if (cancelled) return;
      setItems(visible);
      setLoading(false);

      // Anything the server did not list has no stored status to render: a spec saved
      // locally before the API tracked ownership, or the whole list failing because
      // the creator is signed out. A status token is its own capability, so those can
      // still be resolved one by one. For a signed-in creator this set is empty, which
      // is the point — the six server-listed cards no longer each derive from GitHub.
      const unlisted = visible.filter((item) => !listedByServer.has(item.token));
      if (unlisted.length === 0) return;

      const resolved = await Promise.all(
        unlisted.map(async (item) => {
          try {
            const status = await getSubmissionStatus(item.token, i18n.language);
            return { ...item, status: status.status, slug: status.slug };
          } catch {
            return item;
          }
        }),
      );
      const byToken = new Map(resolved.map((item) => [item.token, item]));
      if (!cancelled) {
        setItems(visible.map((item) => byToken.get(item.token) ?? item).filter((item) => item.status !== 'abandoned'));
      }
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
        <div className="my-games-header-actions">
          {liveCount > 0 ? (
            <span className="status-live">
              <span className="live-dot" aria-hidden="true" />
              {t('myGames.liveCount', { count: liveCount })}
            </span>
          ) : null}
          {onOpenStudio ? (
            <button type="button" className="secondary-btn my-games-studio-btn" onClick={onOpenStudio}>
              <PixelIcon name="wrench" size={12} /> {t('myGames.openStudio')}
            </button>
          ) : null}
        </div>
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
