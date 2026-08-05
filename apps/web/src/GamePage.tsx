import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import { GameBoard } from './GameBoard.js';
import { GameReview } from './GameReview.js';
import { GameSources } from './GameSources.js';
import { fetchGamePage, type GamePage as GamePageData } from './gamePageApi.js';
import { PixelIcon } from './PixelIcon.js';
import { PublishedGameFrame } from './PublishedGameFrame.js';
import { creatorPath, gamePath, playPath, type GamePageTab } from './router.js';
import { parseSpecBlocks } from './specBlocks.js';
import { SpecMarkdown } from './SpecMarkdown.js';
import { VoteWidget } from './VoteWidget.js';

/**
 * Public game page — the "repo page" at `/:handle/:slug`.
 *
 * The layout borrows GitHub's repository page with one inversion: the default tab
 * is the playable game, and sources come last. Reachable without a session (the
 * beta-wall-exempt block in App.tsx); during closed beta only *playing* is gated,
 * so the frame pane swaps for a sign-in card while everything around it renders.
 *
 * Board / review / sources render as named-but-empty surfaces for now — their
 * tranches follow. Keeping the tabs present keeps the URL vocabulary stable
 * (router, spa-paths and this file move together).
 */

type LoadState = 'loading' | 'ready' | 'missing' | 'error';

/** Default surface (the playable game) — no URL segment, hence not a GamePageTab. */
type ActiveTab = GamePageTab | 'game';

export function GamePage({
  handle,
  slug,
  tab,
  onNavigate,
  onCanonicalPath,
  onGameLoaded,
}: {
  handle: string;
  slug: string;
  tab?: GamePageTab;
  onNavigate: (path: string) => void;
  /** Wrong-handle URLs resolve to the owning studio — App replaces, not pushes. */
  onCanonicalPath?: (path: string) => void;
  /** Lets App set document.title once the real game title is known. */
  onGameLoaded?: (title: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const { user, privateBeta } = useAuth();
  const [page, setPage] = useState<GamePageData | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [authOpen, setAuthOpen] = useState(false);
  const activeTab: ActiveTab = tab ?? 'game';
  // The frame mounts on first visit to the Gra tab and then stays mounted (hidden
  // by CSS on other tabs) so switching tabs never restarts a running game.
  const [frameArmed, setFrameArmed] = useState(activeTab === 'game');

  const playGated = privateBeta && !user;

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setPage(null);
    void fetchGamePage(slug)
      .then((loaded) => {
        if (cancelled) return;
        setPage(loaded);
        setState('ready');
      })
      .catch((err: { code?: string }) => {
        if (cancelled) return;
        setState(err.code === 'not_found' ? 'missing' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (activeTab === 'game') setFrameArmed(true);
  }, [activeTab]);

  useEffect(() => {
    if (page) onGameLoaded?.(page.entry.title);
  }, [page, onGameLoaded]);

  // The canonical address carries the owning studio's handle. A page with no
  // creator handle has no address in this namespace — platform and repo games
  // stay reachable at /play/<slug> only.
  const canonicalHandle = page?.entry.creatorHandle ?? null;
  useEffect(() => {
    if (state !== 'ready' || !page) return;
    if (!canonicalHandle) return;
    if (canonicalHandle.toLowerCase() !== handle.toLowerCase()) {
      onCanonicalPath?.(gamePath(canonicalHandle, slug, tab));
    }
  }, [state, page, canonicalHandle, handle, slug, tab, onCanonicalPath]);

  const description = useMemo(() => {
    if (!page?.specMarkdown) return null;
    const firstParagraph = parseSpecBlocks(page.specMarkdown).find((block) => block.kind === 'paragraph');
    return firstParagraph && firstParagraph.kind === 'paragraph' ? firstParagraph.text : null;
  }, [page]);

  if (state === 'loading') {
    return <p className="game-page-status">{t('gamePage.loading')}</p>;
  }
  if (state === 'missing' || (state === 'ready' && !canonicalHandle)) {
    return (
      <div className="game-page-status">
        <p>{t('gamePage.missing')}</p>
        <p>
          <a href={playPath(slug)} onClick={intercept(() => onNavigate(playPath(slug)))}>
            {t('gamePage.missingPlayLink')}
          </a>
        </p>
      </div>
    );
  }
  if (state === 'error' || !page) {
    return <p className="game-page-status game-page-error">{t('gamePage.error')}</p>;
  }

  const { entry, creator, releases, stats, modules, budget } = page;
  const latestRelease = releases[0] ?? null;
  const tabs: Array<{ id: ActiveTab; label: string; count?: number }> = [
    { id: 'game', label: t('gamePage.tabs.game') },
    { id: 'board', label: t('gamePage.tabs.board') },
    { id: 'review', label: t('gamePage.tabs.review') },
    { id: 'releases', label: t('gamePage.tabs.releases'), count: releases.length || undefined },
    { id: 'sources', label: t('gamePage.tabs.sources') },
  ];

  return (
    <article className="game-page">
      <header className="game-page-header">
        <nav className="game-page-breadcrumb" aria-label={t('gamePage.breadcrumbAria')}>
          <a href={creatorPath(handle)} onClick={intercept(() => onNavigate(creatorPath(handle)))}>
            {creator?.profileName ?? handle}
          </a>
          <span aria-hidden="true"> / </span>
          <span className="game-page-breadcrumb-slug">{slug}</span>
          {entry.genre ? <span className="game-page-genre-badge">{entry.genre}</span> : null}
        </nav>
        <h1 className="game-page-title">{entry.title}</h1>
        {description ? <p className="game-page-description">{description}</p> : null}
        <div className="game-page-actions">
          <button type="button" className="primary-btn" onClick={() => onNavigate(playPath(slug))}>
            <PixelIcon name="play" size={13} /> {t('gamePage.play')}
          </button>
          <button
            type="button"
            className="secondary-btn"
            disabled
            title={t('gamePage.followSoon')}
            aria-label={`${t('gamePage.follow')} — ${t('gamePage.followSoon')}`}
          >
            <PixelIcon name="eye" size={13} /> {t('gamePage.follow')}
          </button>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => onNavigate(playPath(slug))}
            title={t('gamePage.remixHint')}
          >
            <PixelIcon name="wrench" size={13} /> {t('gamePage.remix')}
          </button>
        </div>
      </header>

      <nav className="game-page-tabs" aria-label={t('gamePage.tabsAria')}>
        {tabs.map(({ id, label, count }) => {
          const path = id === 'game' ? gamePath(handle, slug) : gamePath(handle, slug, id);
          return (
            <a
              key={id}
              href={path}
              className={`game-page-tab${activeTab === id ? ' is-active' : ''}`}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={intercept(() => onNavigate(path))}
            >
              {label}
              {count !== undefined ? <span className="game-page-tab-count">{count}</span> : null}
            </a>
          );
        })}
      </nav>

      <div className="game-page-layout">
        <main className="game-page-main">
          {frameArmed && !playGated ? (
            <section className={`game-page-frame${activeTab === 'game' ? '' : ' is-hidden'}`}>
              <PublishedGameFrame slug={slug} title={entry.title} embed />
              <p className="game-page-sandbox-note">{t('gamePage.sandboxNote')}</p>
            </section>
          ) : null}
          {activeTab === 'game' && playGated ? (
            <section className="game-page-gated">
              <h2>{t('gamePage.gatedTitle')}</h2>
              <p>{t('gamePage.gatedBody')}</p>
              <button type="button" className="primary-btn" onClick={() => setAuthOpen(true)}>
                {t('gamePage.gatedCta')}
              </button>
            </section>
          ) : null}

          {activeTab === 'releases' ? (
            <section className="game-page-releases" aria-label={t('gamePage.tabs.releases')}>
              {releases.length === 0 ? (
                <p className="game-page-empty">{t('gamePage.releasesEmpty')}</p>
              ) : (
                <ol className="game-page-release-list">
                  {releases.map((release) => (
                    <li key={release.version} className="game-page-release">
                      <span className="game-page-release-version">
                        {release.gateGreen !== null ? (
                          <span
                            className={`game-page-release-dot${release.gateGreen ? ' is-green' : ' is-red'}`}
                            title={t(release.gateGreen ? 'gamePage.gateGreen' : 'gamePage.gateRed')}
                          />
                        ) : null}
                        {release.version}
                      </span>
                      <span className="game-page-release-meta">
                        {formatDate(release.createdAt, i18n.language)}
                        {release.origin === 'editor' ? ` · ${t('gamePage.releaseEditor')}` : ''}
                        {release.current ? (
                          <span className="game-page-release-current">{t('gamePage.releaseCurrent')}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ) : null}

          {activeTab === 'board' ? <GameBoard slug={slug} /> : null}
          {activeTab === 'review' ? <GameReview slug={slug} /> : null}

          {activeTab === 'sources' ? <GameSources slug={slug} /> : null}
        </main>

        <aside className="game-page-side">
          {page.specMarkdown ? (
            <section className="game-page-panel game-page-spec">
              <h2 className="game-page-panel-heading">
                SPEC.md <span className="game-page-panel-hint">{t('gamePage.specHint')}</span>
              </h2>
              <SpecMarkdown markdown={page.specMarkdown} />
            </section>
          ) : null}

          {stats ? (
            <section className="game-page-panel">
              <h2 className="game-page-panel-heading">{t('gamePage.statsHeading')}</h2>
              <dl className="game-page-stats">
                <div>
                  <dt>{t('gamePage.statsPlays', { days: stats.windowDays })}</dt>
                  <dd>{stats.plays.toLocaleString(i18n.language)}</dd>
                </div>
                {stats.medianPlaySeconds !== null ? (
                  <div>
                    <dt>{t('gamePage.statsMedian')}</dt>
                    <dd>{formatDuration(stats.medianPlaySeconds)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t('gamePage.statsReleases')}</dt>
                  <dd>{releases.length}</dd>
                </div>
              </dl>
            </section>
          ) : null}

          <section className="game-page-panel">
            <h2 className="game-page-panel-heading">{t('gamePage.teamHeading')}</h2>
            <ul className="game-page-team">
              {creator ? (
                <li>
                  {creator.avatarUrl ? (
                    <img src={creator.avatarUrl} alt="" width={28} height={28} />
                  ) : (
                    <span className="game-page-lettermark" aria-hidden="true">
                      {creator.profileName.charAt(0).toUpperCase()}
                    </span>
                  )}
                  <a href={creatorPath(handle)} onClick={intercept(() => onNavigate(creatorPath(handle)))}>
                    {creator.profileName}
                  </a>
                  <span className="game-page-team-role">{t('gamePage.roleOwner')}</span>
                </li>
              ) : null}
              <li>
                <span className="game-page-lettermark game-page-lettermark--agent" aria-hidden="true">
                  ⚙
                </span>
                <span>{t('gamePage.agentMember')}</span>
                <span className="game-page-team-role">{t('gamePage.agentReleases', { count: releases.length })}</span>
              </li>
            </ul>
          </section>

          {modules && modules.length > 0 ? (
            <section className="game-page-panel">
              <h2 className="game-page-panel-heading">{t('gamePage.modulesHeading')}</h2>
              <ul className="game-page-modules">
                {modules.map((moduleName) => (
                  <li key={moduleName} className="game-page-module">
                    {moduleName}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {budget ? (
            <section className="game-page-panel">
              <h2 className="game-page-panel-heading">{t('gamePage.budgetHeading')}</h2>
              <div
                className="game-page-budget-bar"
                role="img"
                aria-label={t('gamePage.budgetAria', {
                  used: formatKib(budget.usedBytes),
                  limit: formatKib(budget.limitBytes),
                })}
              >
                <div
                  className="game-page-budget-fill"
                  style={{ width: `${Math.min(100, Math.round((budget.usedBytes / budget.limitBytes) * 100))}%` }}
                />
              </div>
              <p className="game-page-budget-caption">
                {t('gamePage.budgetOf', {
                  used: formatKib(budget.usedBytes),
                  limit: formatKib(budget.limitBytes),
                })}
              </p>
            </section>
          ) : null}

          {latestRelease ? (
            <section className="game-page-panel">
              <h2 className="game-page-panel-heading">{t('gamePage.latestReleaseHeading')}</h2>
              <p className="game-page-latest-release">
                <span className="game-page-release-version">{latestRelease.version}</span>{' '}
                {formatDate(latestRelease.createdAt, i18n.language)}
              </p>
            </section>
          ) : null}

          {!playGated ? (
            <section className="game-page-panel">
              <VoteWidget slug={slug} />
            </section>
          ) : null}
        </aside>
      </div>

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
    </article>
  );
}

function intercept(action: () => void) {
  return (event: { preventDefault: () => void }) => {
    event.preventDefault();
    action();
  };
}

function formatDate(iso: string, language: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(parsed);
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`;
  return `${Math.round(seconds / 60)} min`;
}

function formatKib(bytes: number): string {
  return `${Math.round(bytes / 1024)} KiB`;
}
