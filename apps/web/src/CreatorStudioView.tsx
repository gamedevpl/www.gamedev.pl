import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import type { GameHealth } from './healthApi.js';
import { PixelIcon } from './PixelIcon.js';
import { formatRelativeTime } from './relativeTime.js';
import { playPath, studioPath, type StudioTab } from './router.js';
import { abandonSubmission } from './submissionApi.js';
import { StudioPlaytestPanel } from './StudioPlaytestPanel.js';
import {
  collapseStudioGames,
  filterStudioGames,
  isStudioGamePublished,
  isStudioGameShelfLive,
  sortStudioGames,
  STUDIO_LIVE_STATUSES,
  STUDIO_SHELF_TOOLS_AT,
  type StudioShelfFilter,
  type StudioShelfGame,
} from './studioShelf.js';
import { SubmissionStatusView } from './SubmissionStatusView.js';
import {
  approveSuggestion,
  dismissSuggestion,
  fetchStudioGames,
  fetchStudioHealth,
  fetchStudioScorecards,
  fetchStudioSuggestions,
  fetchGameAutonomy,
  setGameAutonomy,
  setDraftShared,
  type StudioGame,
  type StudioScorecard,
  type StudioSuggestion,
  type AutonomyMode,
} from './studioApi.js';

/**
 * Creator control panel (docs/improvement-loop-plan.md IL-2 creator surface).
 *
 * One game is one thread, and the thread is the studio.
 *
 * Making a game here is a conversation with an agent, and this screen used to be five
 * tabs laid across the top of it — with the same act, "say what to change", living in
 * three of them, so which box a creator was allowed depended on a lifecycle state they
 * had to know in order to find it. There are three surfaces now: the thread, the things
 * beside the thread (facts, sharing, play health, stopping it), and playtest, which
 * genuinely takes the screen. The composer at the foot of the thread is the only one,
 * and it always targets the game's current state — published or not, there is only ever
 * the tip to work on.
 *
 * Shelf scales past a handful of games: compact rows, search/filter once the list grows,
 * and on narrow viewports a game switcher (picker sheet) so the thread is not buried
 * under ten cards. A published game plus its improve tip share a slug — the shelf shows
 * one row (the tip), not the same title twice.
 *
 * Selection + surface live in the URL (`/studio/<slug>/<surface>`) so a refresh or a
 * shared link reopens the same place. The five old tab names still resolve, onto
 * whichever surface absorbed them.
 */

const WINDOWS = [1, 7, 30];

/**
 * Where the details panel stops being a rail beside the thread and becomes a sheet over
 * it. Kept in step with the same breakpoint in styles.css by hand — the two describe one
 * decision, and a panel that behaves like a sheet while it is drawn as a rail (or the
 * reverse) locks the page scroll for something the reader can see straight past.
 */
const SHEET_MAX_WIDTH = 1099;
const SHEET_QUERY = `(max-width: ${SHEET_MAX_WIDTH}px)`;

type NavigateOptions = { replace?: boolean };

type CreatorStudioViewProps = {
  /**
   * Deep-link into a specific game when present: its slug, or — for links minted
   * before games had one — its capability token. Resolved against the creator's own
   * shelf, so it addresses nothing they do not own.
   */
  selectedGame?: string;
  /** Deep-link into a work-surface tab when present. */
  selectedTab?: StudioTab;
  onNavigate: (path: string, options?: NavigateOptions) => void;
  onPlay: (slug: string) => void;
  /** Loads a failed/abandoned concept back into the home hero prompt. */
  onRetryConcept?: (concept: string) => void;
};

/**
 * The thread, always — for a game being built and for one that is live.
 *
 * Both used to land somewhere else: a build opened on its status page, a published game
 * on a facts panel. But the question a creator arrives with is the same either way —
 * what has happened, and how do I ask for the next thing — and that is one surface.
 */
function defaultTabFor(): StudioTab {
  return 'thread';
}

/**
 * Which surfaces exist for this game. All three, for every game: the thread reads the
 * build's history and takes the next message whatever state it is in, the details panel
 * always has facts to show, and playtest always has something to play or a reason it
 * does not yet.
 */
function tabAvailable(_game: StudioGame, _tab: StudioTab): boolean {
  return true;
}

function resolveTab(game: StudioGame, requested?: StudioTab): StudioTab {
  if (requested && tabAvailable(game, requested)) return requested;
  return defaultTabFor();
}

/**
 * How this game is addressed in the URL.
 *
 * The slug once it has one, which is now from the moment the game was submitted. The
 * capability token is the fallback for games created before slugs were assigned up
 * front — and it is a fallback rather than the rule because a token in the URL bar is a
 * grant sitting in browser history, in screenshots, and in anything the creator pastes.
 */
function studioAddress(game: StudioGame): string {
  return game.slug ?? game.token;
}

function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`;
}

function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

function healthFor(game: StudioGame, rows: GameHealth[]): GameHealth | null {
  if (!game.slug) return null;
  return rows.find((row) => row.slug === game.slug) ?? null;
}

export function CreatorStudioView({
  selectedGame,
  selectedTab,
  onNavigate,
  onPlay,
  onRetryConcept,
}: CreatorStudioViewProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [games, setGames] = useState<StudioGame[]>([]);
  const [healthRows, setHealthRows] = useState<GameHealth[]>([]);
  const [scorecards, setScorecards] = useState<StudioScorecard[]>([]);
  const [healthDays, setHealthDays] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Internally a game is its token — that is what every API call on this screen takes.
  // The URL says slug; the shelf is what translates between them.
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<StudioTab>(selectedTab ?? 'thread');
  const [shelfQuery, setShelfQuery] = useState('');
  const [shelfFilter, setShelfFilter] = useState<StudioShelfFilter>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  // Publishing is terminal, so an improvement on a live game opens a *new* job with its
  // own token — one not on the shelf yet. When that happens the open thread moves onto
  // it while the shelf selection stays on the source game (the new job inherits its slug,
  // so the chrome beside the thread is still right). Cleared whenever the selected game
  // changes, so switching games or following a link always lands on that game's own tip.
  const [handoffToken, setHandoffToken] = useState<string | null>(null);
  const shelfSearchId = useId();
  const pickerSearchId = useId();
  const pickerSearchRef = useRef<HTMLInputElement>(null!);

  // What the URL is asking for, readable from inside the shelf fetch below without
  // making that fetch re-run every time the address changes. Seeded rather than
  // assigned in an effect because the case that matters is the first render: a deep
  // link arrives with the shelf request already in flight.
  const requestedGameRef = useRef(selectedGame);
  useEffect(() => {
    requestedGameRef.current = selectedGame;
  }, [selectedGame]);

  // One row per game for picking and counting. Raw `games` still holds every job so
  // abandoning an improve tip can reveal the published sibling again without a refetch.
  const shelfGames = useMemo(() => collapseStudioGames(games), [games]);

  // Resolve the URL's game segment against the shelf — by slug, or by capability token
  // for links minted before games were given slugs at submission. A value matching
  // neither selects nothing: the shelf holds only this creator's games, so a slug
  // belonging to someone else is indistinguishable from one that does not exist.
  // Prefer the collapsed tip when a slug has both a live job and an improve job.
  useEffect(() => {
    if (!selectedGame) return;
    const match = games.find((game) => game.slug === selectedGame || game.token === selectedGame);
    if (!match) return;
    const tip = match.slug ? shelfGames.find((game) => game.slug === match.slug) : match;
    if (tip) setSelected(tip.token);
  }, [selectedGame, games, shelfGames]);

  useEffect(() => {
    if (!user) {
      setGames([]);
      setHealthRows([]);
      setScorecards([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([fetchStudioGames(), fetchStudioHealth(days)])
      .then(([shelf, health]) => {
        if (cancelled) return;
        setGames(shelf);
        setHealthRows(health.games);
        setHealthDays(health.days);
        setTruncated(health.truncated);
        setLoading(false);
        const collapsed = collapseStudioGames(shelf);
        setSelected((current) => {
          if (current) {
            const stillOpen = collapsed.find((game) => game.token === current);
            if (stillOpen) return stillOpen.token;
            // Selected token was a published sibling now collapsed behind its tip.
            const raw = shelf.find((game) => game.token === current);
            if (raw?.slug) {
              const tip = collapsed.find((game) => game.slug === raw.slug);
              if (tip) return tip.token;
            }
          }
          // A URL naming a game picks that one, or none at all. Falling through to the
          // newest would answer "show me this game" with a different game, silently —
          // and since slugs are public, the request may well be for somebody else's.
          const requested = requestedGameRef.current;
          if (requested) {
            const match = shelf.find((game) => game.slug === requested || game.token === requested);
            if (!match) return null;
            return (match.slug ? collapsed.find((game) => game.slug === match.slug)?.token : null) ?? match.token;
          }
          // Same order the shelf paints: active tips first. Collapsed Map order alone
          // would prefer whichever slugged job arrived first in the API payload.
          return sortStudioGames(collapsed)[0]?.token ?? null;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError(t('studioPanel.loadError'));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, days, t]);

  // Keyed on `user` alone, deliberately: a scorecard is the nightly roll-up's fixed window
  // and does not move when the creator switches 7/14/30d. Fetching it in the effect above
  // re-read every one of their games on each toggle, for a response that could not change.
  //
  // Tolerated separately too — a creator should still get their shelf and play health if
  // this fails, and an empty list renders as "not measured yet", which is what a failure
  // means to them anyway.
  useEffect(() => {
    if (!user) {
      setScorecards([]);
      return;
    }

    let cancelled = false;
    fetchStudioScorecards()
      .then((cards) => {
        if (!cancelled) setScorecards(cards);
      })
      .catch(() => {
        if (!cancelled) setScorecards([]);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // A handoff belongs to the game the creator was on when they asked for the improvement.
  // The moment the selected game changes — a shelf pick, a deep link, an Up — that thread
  // is no longer on screen, so drop the override and let the newly selected game show its
  // own current tip.
  useEffect(() => {
    setHandoffToken(null);
  }, [selected]);

  const activeGame = useMemo(() => shelfGames.find((game) => game.token === selected) ?? null, [shelfGames, selected]);
  // The token the thread is actually showing: the new job's after an improvement handoff,
  // otherwise the selected game's own.
  const threadToken = handoffToken ?? activeGame?.token ?? null;
  // Playtest must follow the same handoff: if it kept the published shelf record, pause
  // feedback would call submitImprovement on the old token and open a second concurrent
  // round (Codex P1). While a handoff is live, treat the surface as the unpublished new job.
  const playtestGame = useMemo((): StudioShelfGame | null => {
    if (!activeGame) return null;
    if (!handoffToken || handoffToken === activeGame.token) return activeGame;
    return {
      ...activeGame,
      token: handoffToken,
      lastKnownStatus: 'building',
      publishedAt: undefined,
      // Tip is not catalog-published; drop any sibling stamp so playtest routes to feedback.
      livePublishedAt: undefined,
    };
  }, [activeGame, handoffToken]);
  const playtestPublished = Boolean(playtestGame && isStudioGamePublished(playtestGame) && !handoffToken);
  const selectedHealth = activeGame ? healthFor(activeGame, healthRows) : null;
  const selectedScorecard = activeGame?.slug
    ? (scorecards.find((card) => card.slug === activeGame.slug) ?? null)
    : null;
  const visibleGames = useMemo(
    () => filterStudioGames(shelfGames, { filter: shelfFilter, query: shelfQuery }),
    [shelfGames, shelfFilter, shelfQuery],
  );
  const showShelfTools = shelfGames.length >= STUDIO_SHELF_TOOLS_AT;
  // The URL named a game and the shelf does not have it: a typo, a game since abandoned,
  // or somebody else's slug. Said plainly, because an unexplained shelf looks like the
  // link worked and the game vanished.
  const missingGame = Boolean(selectedGame) && !loading && !error && shelfGames.length > 0 && !activeGame;
  const buildingCount = useMemo(
    () => shelfGames.filter((game) => game.lastKnownStatus && STUDIO_LIVE_STATUSES.has(game.lastKnownStatus)).length,
    [shelfGames],
  );
  const liveCount = useMemo(() => shelfGames.filter((game) => isStudioGameShelfLive(game)).length, [shelfGames]);

  // Keep the visible tab aligned with the selected game, and the URL on the game's
  // current address. Only writes an address when the route already carried one (a deep
  // link, or an earlier explicit pick via selectGame/openTab); bare `/studio` keeps
  // shelf selection local so a screenshot or history entry doesn't name a game the
  // creator never asked to put there.
  //
  // This is also where an old `/studio/<token>` link upgrades itself: the address it
  // rewrites to is the slug, so following a link out of a months-old notification email
  // leaves a readable URL behind and takes the capability token out of history.
  useEffect(() => {
    if (!selected) return;
    const game = shelfGames.find((entry) => entry.token === selected);
    if (!game) return;
    const next = resolveTab(game, selectedTab);
    setTab(next);
    // The route carried no game, so nothing is written back: this is bare `/studio`,
    // where the shelf's convenience selection is the view's business and not the URL's.
    if (!selectedGame) return;
    const canonical = studioPath(studioAddress(game), next);
    if (window.location.pathname !== canonical) {
      onNavigate(canonical, { replace: true });
    }
  }, [selected, selectedTab, selectedGame, shelfGames, onNavigate]);

  /**
   * Below the rail breakpoint the details panel is a sheet over the thread, and a sheet
   * has obligations a side panel does not: the page behind it must not scroll, Escape
   * must close it, and there must be something to tap beside it to dismiss. The game
   * picker already does all three; this arrived without any of them.
   */
  const detailsOpen = tab === 'details';
  const [detailsIsSheet, setDetailsIsSheet] = useState(false);
  useEffect(() => {
    if (!detailsOpen) {
      setDetailsIsSheet(false);
      return;
    }
    // Width, not `matchMedia` alone: the query is the precise instrument but it is not
    // universally present (jsdom has none, and neither do some embedded webviews), and a
    // panel that throws where it is missing is worse than one measured a cruder way.
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(SHEET_QUERY) : null;
    const sync = () => setDetailsIsSheet(query ? query.matches : window.innerWidth <= SHEET_MAX_WIDTH);
    sync();
    query?.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') openTabRef.current('thread');
    };
    window.addEventListener('keydown', onKey);
    return () => {
      query?.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('keydown', onKey);
    };
  }, [detailsOpen]);

  useEffect(() => {
    if (!detailsIsSheet) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [detailsIsSheet]);

  useEffect(() => {
    if (!pickerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => pickerSearchRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  function selectGame(token: string) {
    const next = shelfGames.find((game) => game.token === token) ?? null;
    const nextTab = defaultTabFor();
    setSelected(token);
    setTab(nextTab);
    setPickerOpen(false);
    if (next) onNavigate(studioPath(studioAddress(next), nextTab));
  }

  // Read by the Escape handler above, which is registered once per open rather than
  // re-registered on every render that changes what `openTab` closes over.
  const openTabRef = useRef((next: StudioTab) => {
    void next;
  });

  function openTab(next: StudioTab) {
    if (!activeGame || !tabAvailable(activeGame, next)) return;
    setTab(next);
    onNavigate(studioPath(studioAddress(activeGame), next));
  }
  openTabRef.current = openTab;

  if (!user) {
    return (
      <section className="studio-panel">
        <header className="studio-panel-header">
          <div>
            <p className="studio-kicker">{t('studioPanel.kicker')}</p>
            <h1 className="section-title">{t('studioPanel.title')}</h1>
            <p className="panel-copy">{t('studioPanel.signInHint')}</p>
          </div>
          <button type="button" className="primary-btn" onClick={() => setAuthOpen(true)}>
            <PixelIcon name="user" size={14} /> {t('header.signIn')}
          </button>
        </header>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} />
      </section>
    );
  }

  const shelfList = (
    <StudioShelfList
      games={visibleGames}
      selected={selected}
      locale={i18n.language}
      emptyLabel={t('studioPanel.shelf.noMatches')}
      onSelect={selectGame}
    />
  );

  return (
    <section className={`studio-panel${tab === 'playtest' ? ' is-playtesting' : ''}${activeGame ? ' is-focused' : ''}`}>
      <header className="studio-panel-header">
        <div>
          <p className="studio-kicker">{t('studioPanel.kicker')}</p>
          <h1 className="section-title">{t('studioPanel.title')}</h1>
          <p className="panel-copy">{t('studioPanel.subtitle')}</p>
        </div>
        <button type="button" className="studio-home-link" onClick={() => onNavigate('/')}>
          <PixelIcon name="undo" size={12} /> {t('studioPanel.backHome')}
        </button>
      </header>

      {loading ? <p className="studio-empty">{t('studioPanel.loading')}</p> : null}
      {error ? <p className="studio-empty studio-error">{error}</p> : null}

      {!loading && !error && shelfGames.length === 0 ? (
        <div className="studio-empty-state">
          <p>{t('studioPanel.empty')}</p>
          <button type="button" className="primary-btn" onClick={() => onNavigate('/')}>
            <PixelIcon name="sparkle" size={14} /> {t('studioPanel.createFirst')}
          </button>
        </div>
      ) : null}

      {!loading && shelfGames.length > 0 ? (
        <div
          className={[
            'studio-layout',
            activeGame ? 'is-game-open' : '',
            // Once the shelf is no longer a glanceable handful, collapse it after
            // selection so the work surface owns the viewport (desktop + mobile).
            activeGame && showShelfTools ? 'is-focus' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          <aside className="studio-shelf" aria-label={t('studioPanel.shelfAria')}>
            <div className="studio-shelf-head">
              <h2 className="studio-shelf-heading">{t('studioPanel.shelf.heading')}</h2>
              <span className="studio-shelf-count">{t('studioPanel.shelf.count', { count: shelfGames.length })}</span>
            </div>
            <button type="button" className="studio-shelf-new" onClick={() => onNavigate('/')}>
              <PixelIcon name="sparkle" size={12} /> {t('studioPanel.shelf.newGame')}
            </button>
            <StudioShelfControls
              searchInputId={shelfSearchId}
              query={shelfQuery}
              filter={shelfFilter}
              showTools={showShelfTools}
              buildingCount={buildingCount}
              liveCount={liveCount}
              totalCount={shelfGames.length}
              onQueryChange={setShelfQuery}
              onFilterChange={setShelfFilter}
            />
            {shelfList}
          </aside>

          {missingGame ? <p className="studio-empty studio-error">{t('studioPanel.gameNotFound')}</p> : null}

          {activeGame ? (
            <div className="studio-detail">
              <div className="studio-detail-head">
                <button
                  type="button"
                  className="studio-game-switcher"
                  onClick={() => setPickerOpen(true)}
                  aria-haspopup="dialog"
                  aria-expanded={pickerOpen}
                >
                  <span className="studio-game-switcher-meta">
                    <span className="studio-game-switcher-label">{t('studioPanel.shelf.switcher')}</span>
                    <span className="studio-game-switcher-count">
                      {t('studioPanel.shelf.count', { count: shelfGames.length })}
                    </span>
                  </span>
                  <span className="studio-game-switcher-title">{activeGame.title}</span>
                  {activeGame.slug ? <code className="studio-slug">{activeGame.slug}</code> : null}
                  {/* Not `expand`: once a phone puts this button and the Details button on
                      one row, the same icon appeared twice on that row meaning two
                      different things. A folder is the other games. */}
                  <PixelIcon name="folder" size={12} />
                </button>
                <div className="studio-detail-title-row">
                  <div className="studio-detail-title-block">
                    <h2>{activeGame.title}</h2>
                    {activeGame.slug ? <code className="studio-slug">{activeGame.slug}</code> : null}
                  </div>
                  {/* Actions, not tabs. A tab strip across the work surface says the
                      surfaces are peers; the thread is not a peer of the panel listing
                      when the game was made. These open things beside it and leave it
                      where it is. */}
                  <div className="studio-head-actions">
                    {/* Playtest is the next action after a build — same weight as Send
                        feedback, not a peer of the Details toggle beside it. When already
                        open (empty/error keeps chrome visible), clicking again returns to
                        the thread so creators are never stuck without a Build tab. */}
                    {/* Labels are wrapped rather than left as bare text so a phone can
                        hide the word and keep the icon — and hide it the way that leaves
                        the button still named for a screen reader, not display: none. */}
                    <button
                      type="button"
                      className={`studio-head-action is-primary${tab === 'playtest' ? ' is-active' : ''}`}
                      aria-pressed={tab === 'playtest'}
                      onClick={() => openTab(tab === 'playtest' ? 'thread' : 'playtest')}
                    >
                      <PixelIcon name="play" size={12} />{' '}
                      <span className="studio-head-action-label">{t('studioPanel.tabs.playtest')}</span>
                    </button>
                    <button
                      type="button"
                      className={`studio-head-action${tab === 'details' ? ' is-active' : ''}`}
                      aria-pressed={tab === 'details'}
                      onClick={() => openTab(tab === 'details' ? 'thread' : 'details')}
                    >
                      <PixelIcon name="expand" size={12} />{' '}
                      <span className="studio-head-action-label">{t('studioPanel.tabs.details')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* The thread stays put. Details opens beside it on a wide screen and over
                  it on a narrow one; only playtest, which needs the whole viewport to be
                  a game, replaces it. */}
              <div className={`studio-workspace${tab === 'details' ? ' is-details-open' : ''}`}>
                {tab !== 'playtest' ? (
                  <div className="studio-build">
                    <SubmissionStatusView
                      key={threadToken ?? activeGame.token}
                      token={threadToken ?? activeGame.token}
                      embedded
                      justHandedOff={handoffToken != null}
                      onImproved={(newToken) => setHandoffToken(newToken)}
                      onPlaytest={() => openTab('playtest')}
                      onRetry={
                        onRetryConcept
                          ? (concept) => {
                              onRetryConcept(concept);
                              onNavigate('/');
                            }
                          : undefined
                      }
                    />
                  </div>
                ) : null}

                {tab === 'playtest' && playtestGame ? (
                  <StudioPlaytestPanel
                    game={playtestGame}
                    published={playtestPublished}
                    onExit={() => openTab('thread')}
                    pickerOpen={pickerOpen}
                  />
                ) : null}

                {/* Everything that is about the game rather than said to it: when it was
                    made, who can play it, how it is doing, and how to stop it. */}
                {tab === 'details' ? (
                  <>
                    {detailsIsSheet ? (
                      <div
                        className="modal-backdrop studio-rail-backdrop"
                        role="presentation"
                        onClick={() => openTab('thread')}
                      />
                    ) : null}
                    <aside
                      className="studio-rail"
                      aria-label={t('studioPanel.tabs.details')}
                      {...(detailsIsSheet ? { role: 'dialog', 'aria-modal': true } : {})}
                    >
                      <div className="studio-rail-head">
                        <h3>{t('studioPanel.tabs.details')}</h3>
                        <button
                          type="button"
                          className="modal-close-btn"
                          onClick={() => openTab('thread')}
                          aria-label={t('studioPanel.shelf.closePicker')}
                        >
                          <PixelIcon name="close" size={14} />
                        </button>
                      </div>
                      <DetailsPanel
                        // Keyed on the game, so switching to another one gives a fresh
                        // panel rather than reusing this one's state. Without it every
                        // `useState(game.…)` initialiser inside keeps the previous game's
                        // value — the share switch reading the wrong game's setting, and,
                        // worse, an armed Stop-build carrying across to a game the creator
                        // never armed it on. Reachable by any move between two `/details`
                        // URLs, browser Back included.
                        key={activeGame.token}
                        game={activeGame}
                        health={selectedHealth}
                        days={days}
                        healthDays={healthDays}
                        truncated={truncated}
                        scorecard={selectedScorecard}
                        onDaysChange={setDays}
                        onOpenPlaytest={() => openTab('playtest')}
                        onPlay={() => activeGame.slug && onPlay(activeGame.slug)}
                        onRemoved={(token) => {
                          setGames((prev) => prev.filter((game) => game.token !== token));
                          setSelected((current) => (current === token ? null : current));
                          onNavigate(studioPath());
                        }}
                      />
                    </aside>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {pickerOpen ? (
        <div
          className="modal-backdrop studio-picker-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setPickerOpen(false);
          }}
        >
          <div
            className="studio-picker"
            role="dialog"
            aria-modal="true"
            aria-label={t('studioPanel.shelf.pickerTitle')}
          >
            <header className="studio-picker-header">
              <div>
                <h2>{t('studioPanel.shelf.pickerTitle')}</h2>
                <p>{t('studioPanel.shelf.count', { count: shelfGames.length })}</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setPickerOpen(false)}
                aria-label={t('studioPanel.shelf.closePicker')}
              >
                <PixelIcon name="close" size={14} />
              </button>
            </header>
            <StudioShelfControls
              searchInputId={pickerSearchId}
              searchRef={pickerSearchRef}
              query={shelfQuery}
              filter={shelfFilter}
              showTools={showShelfTools || shelfGames.length > 1}
              buildingCount={buildingCount}
              liveCount={liveCount}
              totalCount={shelfGames.length}
              onQueryChange={setShelfQuery}
              onFilterChange={setShelfFilter}
            />
            {shelfList}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StudioShelfControls({
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

function StudioShelfList({
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
        // Building wins the dot: a revise tip on a live game is still "moving".
        const live = !building && isStudioGameShelfLive(game);
        return (
          <li key={game.token}>
            <button
              type="button"
              className={`studio-shelf-item${active ? ' is-active' : ''}${building ? ' is-live' : ''}${live ? ' is-published' : ''}`}
              onClick={() => onSelect(game.token)}
              aria-current={active ? 'true' : undefined}
            >
              {/* A dot, not a label. Every row used to carry its status in words and its
                  age beside it, which made a list of five games a wall of small text with
                  the titles — the only thing being chosen between — third in the reading
                  order. The state that matters at a glance is "is this one moving", and a
                  dot says that without spending a line on it. */}
              <span
                className={`studio-shelf-dot${building ? ' is-live' : ''}${live ? ' is-published' : ''}`}
                aria-hidden="true"
              />
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

/**
 * The things beside the thread: when the game was made, how it is doing, who can play
 * it, and how to stop it. Everything here is *about* the game; the thread is where it
 * is talked to.
 */
function DetailsPanel({
  game,
  health,
  days,
  healthDays,
  truncated,
  scorecard,
  onDaysChange,
  onOpenPlaytest,
  onPlay,
  onRemoved,
}: {
  game: StudioShelfGame;
  health: GameHealth | null;
  days: number;
  healthDays: string[];
  truncated: boolean;
  scorecard: StudioScorecard | null;
  onDaysChange: (days: number) => void;
  onOpenPlaytest: () => void;
  onPlay: () => void;
  onRemoved: (token: string) => void;
}) {
  const { t, i18n } = useTranslation();
  // This *job* is published — composer/playtest routing. Distinct from catalog-live below.
  const publishedJob = isStudioGamePublished(game);
  const catalogLive = isStudioGameShelfLive(game);
  const publishedAt = game.publishedAt ?? game.livePublishedAt;
  const [abandonArmed, setAbandonArmed] = useState(false);
  const [abandoning, setAbandoning] = useState(false);

  async function handleAbandon() {
    if (!abandonArmed) {
      setAbandonArmed(true);
      return;
    }
    setAbandoning(true);
    try {
      await abandonSubmission(game.token);
      onRemoved(game.token);
    } catch {
      setAbandoning(false);
      setAbandonArmed(false);
    }
  }

  return (
    <div className="studio-overview">
      <ul className="funnel-stats studio-facts">
        <li>
          <span className="funnel-stat-value">{formatRelativeTime(Date.parse(game.createdAt), i18n.language)}</span>
          <span className="funnel-stat-label">{t('studioPanel.overview.created')}</span>
        </li>
        {publishedAt ? (
          <li>
            <span className="funnel-stat-value">{formatRelativeTime(Date.parse(publishedAt), i18n.language)}</span>
            <span className="funnel-stat-label">{t('studioPanel.overview.published')}</span>
          </li>
        ) : null}
        {health ? (
          <li>
            <span className="funnel-stat-value">
              {health.sessions}
              <span className="studio-fact-suffix">
                · {formatSeconds(health.totalPlaySeconds)} {t('studioPanel.overview.play')}
              </span>
            </span>
            <span className="funnel-stat-label">{t('studioPanel.overview.sessions')}</span>
          </li>
        ) : null}
      </ul>

      <div className="studio-actions">
        {/* Nothing here to reopen the build with: the thread is on the screen already,
            beside this panel. Playing a published game is the one action that is not
            simply "look left". */}
        {catalogLive && game.slug ? (
          <button type="button" className="primary-btn" onClick={onPlay}>
            <PixelIcon name="play" size={12} /> {t('myGames.play')}
          </button>
        ) : null}
        <button type="button" className="secondary-btn" onClick={onOpenPlaytest}>
          <PixelIcon name="play" size={12} /> {t('studioPanel.overview.playtest')}
        </button>
        {!publishedJob && game.lastKnownStatus !== 'abandoned' ? (
          <button
            type="button"
            className={`status-abandon${abandonArmed ? ' is-danger' : ''}`}
            onClick={() => void handleAbandon()}
            disabled={abandoning}
          >
            {abandonArmed ? t('studioPanel.overview.abandonConfirm') : t('studioPanel.overview.abandon')}
          </button>
        ) : null}
      </div>

      {/* Draft share is for pre-catalog games. A revise tip on a live slug already has a
          public play link — offering a second "share the draft" switch would lie. */}
      {!catalogLive && game.slug && game.lastKnownStatus !== 'abandoned' ? <DraftShareControl game={game} /> : null}

      {/* Only once there is play to report on. Before a game is live every one of these
          numbers is zero, and a wall of zeroes reads as a verdict rather than as
          "nobody has played it yet, because nobody can". */}
      {catalogLive ? (
        <StatsSection
          game={game}
          health={health}
          days={days}
          healthDays={healthDays}
          truncated={truncated}
          scorecard={scorecard}
          onDaysChange={onDaysChange}
        />
      ) : null}
    </div>
  );
}

/**
 * Whether anyone else can play this game before it is published.
 *
 * Off until the creator turns it on, and the game is in no catalog and no rail either
 * way — the link is the only way in, which is what makes one switch enough. The link
 * shown is the game's ordinary permalink, the same one it will keep once it is live,
 * so there is nothing to re-share when that happens.
 */
function DraftShareControl({ game }: { game: StudioGame }) {
  const { t } = useTranslation();
  const [shared, setShared] = useState(Boolean(game.draftShared));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const url = game.slug ? new URL(playPath(game.slug), window.location.href).toString() : '';

  async function toggle() {
    const next = !shared;
    setBusy(true);
    setError(null);
    // Optimistic, and reverted on failure: the switch is the whole control, so leaving
    // it in the old position while the request runs reads as a dead button.
    setShared(next);
    try {
      await setDraftShared(game.token, next);
    } catch {
      setShared(!next);
      setError(t('studioPanel.share.error'));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission or no clipboard API — the link is on screen to select
      // by hand, so this needs no error state.
    }
  }

  return (
    <div className="studio-share">
      <div className="studio-share-head">
        <h3 className="studio-share-title">{t('studioPanel.share.title')}</h3>
        <button
          type="button"
          role="switch"
          aria-checked={shared}
          className={`studio-share-toggle${shared ? ' is-on' : ''}`}
          onClick={() => void toggle()}
          disabled={busy}
        >
          <span className="studio-share-toggle-track" aria-hidden="true" />
          {shared ? t('studioPanel.share.on') : t('studioPanel.share.off')}
        </button>
      </div>
      <p className="studio-share-hint">{t(shared ? 'studioPanel.share.hintOn' : 'studioPanel.share.hintOff')}</p>
      {shared ? (
        <p className="status-note status-share">
          <a className="inline-link" href={url}>
            {url}
          </a>
          <button type="button" className="status-share-copy" onClick={() => void copy()}>
            <PixelIcon name={copied ? 'check' : 'globe'} size={12} />{' '}
            {copied ? t('statusView.shareCopied') : t('statusView.shareCopy')}
          </button>
        </p>
      ) : null}
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}

function StatsSection({
  game,
  health,
  days,
  healthDays,
  truncated,
  scorecard,
  onDaysChange,
}: {
  game: StudioGame;
  health: GameHealth | null;
  days: number;
  healthDays: string[];
  truncated: boolean;
  scorecard: StudioScorecard | null;
  onDaysChange: (days: number) => void;
}) {
  const { t } = useTranslation();

  if (!game.slug) {
    return <p className="studio-empty">{t('studioPanel.stats.noSlug')}</p>;
  }

  return (
    <div className="studio-stats">
      <div className="health-windows">
        {WINDOWS.map((window) => (
          <button
            key={window}
            type="button"
            className={window === days ? 'health-window is-active' : 'health-window'}
            onClick={() => onDaysChange(window)}
          >
            {window}d
          </button>
        ))}
      </div>

      {healthDays.length > 0 ? (
        <p className="studio-stats-range">
          {t('studioPanel.stats.range', { from: healthDays[healthDays.length - 1], to: healthDays[0] })}
        </p>
      ) : null}
      {truncated ? <p className="health-note">{t('studioPanel.stats.truncated')}</p> : null}

      {!health || health.sessions === 0 ? (
        <p className="studio-empty">{t('studioPanel.stats.empty')}</p>
      ) : (
        <ul className="funnel-stats">
          <li>
            <span className="funnel-stat-value">{health.sessions}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.sessions')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">
              {health.bounces} ({percent(health.sessions === 0 ? 0 : health.bounces / health.sessions)})
            </span>
            <span className="funnel-stat-label">{t('studioPanel.stats.bounces')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{formatSeconds(health.medianPlaySeconds)}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.medianPlay')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{formatSeconds(health.totalPlaySeconds)}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.totalPlay')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{health.errors}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.errors')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{percent(health.stallRate)}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.stallRate')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{health.medianFps === null ? '—' : Math.round(health.medianFps)}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.medianFps')}</span>
          </li>
        </ul>
      )}

      <PlayerReactions scorecard={scorecard} />

      <SuggestedImprovements slug={game.slug} />

      <AutonomySetting slug={game.slug} />

      {health && health.errorSamples.length > 0 ? (
        <div className="studio-error-samples">
          <h3 className="health-section-title">{t('studioPanel.stats.errorSamples')}</h3>
          <ul>
            {health.errorSamples.map((sample) => (
              <li key={sample.message}>
                <code>{sample.message}</code>
                <span className="health-error-count">×{sample.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Votes and what players wrote — the third question the stats tab has to answer.
 *
 * Separated visually from the numbers above because it is measured over a different
 * window: the health block recomputes over the window the creator picked, while these come
 * from the nightly scorecard's fixed roll. Two windows on one screen is fine; two windows
 * that look like one is not, so the period is stated.
 *
 * Themes are player-written text summarized by a model. React escapes them, which is what
 * makes showing them safe; the label is what stops them being mistaken for something the
 * system is asserting.
 */
function PlayerReactions({ scorecard }: { scorecard: StudioScorecard | null }) {
  const { t } = useTranslation();

  // Absent, not zero: no scorecard means this game has not been rolled up yet, which is
  // not the same as a game measured and found to have no reactions.
  if (!scorecard) return null;

  const themes = scorecard.untrustedThemes;
  const nothingYet = scorecard.votes.up === 0 && scorecard.votes.down === 0 && scorecard.feedbackCount === 0;

  return (
    <div className="studio-reactions">
      <h3 className="health-section-title">{t('studioPanel.stats.reactions')}</h3>
      <p className="studio-stats-range">{t('studioPanel.stats.reactionsWindow', { days: scorecard.windowDays })}</p>

      {nothingYet ? (
        <p className="studio-empty">{t('studioPanel.stats.reactionsEmpty')}</p>
      ) : (
        <ul className="funnel-stats">
          <li>
            <span className="funnel-stat-value">
              {scorecard.votes.up}↑ {scorecard.votes.down}↓
            </span>
            <span className="funnel-stat-label">{t('studioPanel.stats.votes')}</span>
          </li>
          <li>
            <span className="funnel-stat-value">{scorecard.feedbackCount}</span>
            <span className="funnel-stat-label">{t('studioPanel.stats.notes')}</span>
          </li>
        </ul>
      )}

      {themes.length > 0 ? (
        <div className="studio-themes">
          <h4 className="studio-themes-title">{t('studioPanel.stats.themes')}</h4>
          <p className="health-note">{t('studioPanel.stats.themesNote')}</p>
          <ul className="studio-theme-list">
            {themes.map((entry) => (
              <li key={entry.theme}>
                {entry.theme} <span className="health-error-count">×{entry.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The suggestion inbox for one game (docs/improvement-loop-plan.md IL-3).
 *
 * Cards read insight → evidence → decide. Two things are deliberate here.
 *
 * The **evidence** the platform measured is stated plainly, while the game's and players'
 * own words sit in a separate block labelled as such. React escapes both, so neither is
 * a markup risk; the separation is about not letting a string somebody else chose read
 * as though this platform were asserting it.
 *
 * **Approving can succeed without an implementer.** The API records the decision and
 * reports `no-implementer` when the coding agent could not be reached, so this renders
 * that as a real outcome with a retry rather than as a failure — the creator's click
 * counted either way.
 */
function SuggestedImprovements({ slug }: { slug: string | undefined }) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<StudioSuggestion[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStudioSuggestions()
      .then((rows) => {
        if (!cancelled) setSuggestions(rows);
      })
      // A queue that fails to load must not take the stats page down with it.
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mine = useMemo(
    () => (suggestions ?? []).filter((entry) => entry.slug === slug && entry.status === 'proposed'),
    [suggestions, slug],
  );

  const replace = (updated: StudioSuggestion) =>
    setSuggestions((rows) => (rows ?? []).map((row) => (row.id === updated.id ? updated : row)));

  const decided = (suggestions ?? []).filter(
    (entry) => entry.slug === slug && (entry.status === 'dispatched' || entry.status === 'no-implementer'),
  );

  async function act(id: string, run: () => Promise<StudioSuggestion>) {
    setBusyId(id);
    setError(null);
    try {
      replace(await run());
      setDismissing(null);
    } catch (caught) {
      const status = (caught as { status?: number }).status;
      setError(status === 429 ? t('studioPanel.suggestions.quota') : t('studioPanel.suggestions.failed'));
    } finally {
      setBusyId(null);
    }
  }

  if (suggestions === null || (mine.length === 0 && decided.length === 0)) return null;

  return (
    <div className="studio-suggestions">
      <h3 className="health-section-title">{t('studioPanel.suggestions.title')}</h3>
      <p className="health-note">{t('studioPanel.suggestions.note')}</p>
      {error ? <p className="studio-error">{error}</p> : null}

      {decided.map((entry) => (
        <p key={entry.id} className="studio-suggestion-outcome">
          {entry.status === 'dispatched'
            ? t('studioPanel.suggestions.filed')
            : t('studioPanel.suggestions.noImplementer')}
        </p>
      ))}

      {mine.map((entry) => (
        <article key={entry.id} className="studio-suggestion">
          <h4 className="studio-suggestion-class">{classLabel(entry.class, t)}</h4>

          <ul className="studio-suggestion-evidence">
            {entry.evidence.map((item) => (
              <li key={item.finding}>{item.finding}</li>
            ))}
          </ul>

          <SuggestionContext context={entry.untrustedContext} />

          {dismissing === entry.id ? (
            <div className="studio-suggestion-reasons">
              <p>{t('studioPanel.suggestions.dismissReason')}</p>
              {DISMISS_REASON_KEYS.map(([reason, key]) => (
                <button
                  key={reason}
                  type="button"
                  className="studio-suggestion-reason"
                  disabled={busyId === entry.id}
                  onClick={() => act(entry.id, () => dismissSuggestion(entry.id, reason))}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          ) : (
            <div className="studio-suggestion-actions">
              <button
                type="button"
                className="studio-suggestion-approve"
                disabled={busyId === entry.id}
                onClick={() => act(entry.id, () => approveSuggestion(entry.id))}
                title={t('studioPanel.suggestions.approveHint')}
              >
                {t('studioPanel.suggestions.approve')}
              </button>
              <button
                type="button"
                className="studio-suggestion-dismiss"
                disabled={busyId === entry.id}
                onClick={() => setDismissing(entry.id)}
              >
                {t('studioPanel.suggestions.dismiss')}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

/** The fixed dismissal vocabulary the API accepts, paired with its translation key. */
const DISMISS_REASON_KEYS: Array<[string, string]> = [
  ['intentional', 'studioPanel.suggestions.reasonIntentional'],
  ['not-a-problem', 'studioPanel.suggestions.reasonNotAProblem'],
  ['wont-fix', 'studioPanel.suggestions.reasonWontFix'],
  ['not-now', 'studioPanel.suggestions.reasonNotNow'],
  ['bad-evidence', 'studioPanel.suggestions.reasonBadEvidence'],
];

function classLabel(suggestionClass: string, t: (key: string) => string): string {
  if (suggestionClass === 'defect') return t('studioPanel.suggestions.classDefect');
  if (suggestionClass === 'friction') return t('studioPanel.suggestions.classFriction');
  if (suggestionClass === 'design-change') return t('studioPanel.suggestions.classDesignChange');
  return suggestionClass;
}

/** Game- and player-authored strings, kept visually separate from what we measured. */
function SuggestionContext({ context }: { context: StudioSuggestion['untrustedContext'] }) {
  const { t } = useTranslation();
  const samples = context?.errorSamples ?? [];
  const themes = context?.feedbackThemes ?? [];
  if (!samples.length && !themes.length) return null;

  return (
    <div className="studio-suggestion-context">
      <h5 className="studio-themes-title">{t('studioPanel.suggestions.context')}</h5>
      <p className="health-note">{t('studioPanel.suggestions.contextNote')}</p>
      <ul className="studio-theme-list">
        {samples.map((sample) => (
          <li key={sample.message}>
            {sample.message} <span className="health-error-count">×{sample.count}</span>
          </li>
        ))}
        {themes.map((theme) => (
          <li key={theme.theme}>
            {theme.theme} <span className="health-error-count">×{theme.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * What the platform may do to this game without asking (IL-4).
 *
 * Framed as permission rather than as a feature toggle, and it says the reassuring part
 * out loud: nothing reaches the site without the creator's review whatever they pick.
 * That is not marketing — `publishing` is reachable only from `ready_for_review` in the
 * job state machine, so it is a property of the system rather than a promise about it.
 */
function AutonomySetting({ slug }: { slug: string | undefined }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AutonomyMode | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchGameAutonomy(slug)
      .then((value) => {
        if (!cancelled) setMode(value);
      })
      // A game the creator does not own, or a deployment without this route, simply has
      // no control to show — it must not break the stats page around it.
      .catch(() => {
        if (!cancelled) setMode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug || mode === null) return null;

  async function choose(next: AutonomyMode) {
    if (!slug) return;
    const previous = mode;
    setMode(next);
    setState('saving');
    try {
      setMode(await setGameAutonomy(slug, next));
      setState('saved');
    } catch {
      // Put it back rather than leave the control showing a setting that is not stored.
      setMode(previous);
      setState('error');
    }
  }

  return (
    <div className="studio-autonomy">
      <h3 className="health-section-title">{t('studioPanel.autonomy.title')}</h3>
      <p className="health-note">{t('studioPanel.autonomy.note')}</p>
      <ul className="studio-autonomy-options">
        {AUTONOMY_CHOICES.map(([value, labelKey, hintKey]) => (
          <li key={value}>
            <label className={value === mode ? 'studio-autonomy-option is-active' : 'studio-autonomy-option'}>
              <input
                type="radio"
                name={`autonomy-${slug}`}
                checked={value === mode}
                disabled={state === 'saving'}
                onChange={() => choose(value)}
              />
              <span>
                <strong>{t(labelKey)}</strong>
                <small>{t(hintKey)}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {state === 'error' ? <p className="studio-error">{t('studioPanel.autonomy.failed')}</p> : null}
      {state === 'saved' ? <p className="studio-autonomy-saved">{t('studioPanel.autonomy.saved')}</p> : null}
    </div>
  );
}

/** Ordered least to most permission, so the list reads as a scale rather than a menu. */
const AUTONOMY_CHOICES: Array<[AutonomyMode, string, string]> = [
  ['digest-only', 'studioPanel.autonomy.digestOnly', 'studioPanel.autonomy.digestOnlyHint'],
  ['suggest', 'studioPanel.autonomy.suggest', 'studioPanel.autonomy.suggestHint'],
  ['auto-fix-defects', 'studioPanel.autonomy.autoFixDefects', 'studioPanel.autonomy.autoFixDefectsHint'],
  ['auto-tune', 'studioPanel.autonomy.autoTune', 'studioPanel.autonomy.autoTuneHint'],
];
