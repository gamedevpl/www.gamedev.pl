import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../AuthContext.js';
import { AuthModal } from '../../AuthModal.js';
import { ClaimHandleModal } from '../../ClaimHandleModal.js';
import { StudioCreatorProfileProvider } from '../../studioCreatorProfile.js';
import type { GameHealth } from '../../healthApi.js';
import { PixelIcon } from '../../PixelIcon.js';
import { studioPath, type StudioTab } from '../../core/router.js';
import { handoffToPlatform } from '../../submissionApi.js';
import { StudioShotToasts } from './StudioShotToasts.js';
import { type CodeActionsMode } from './CodeActionsMenu.js';
import { CodeSurface } from './CodeSurface.js';
import { EditorPanel } from './EditorPanel.js';
import { StudioStage, type StagePosture, type StageStatus } from './StudioStage.js';
import { StudioStrip } from './StudioStrip.js';
import { usePlayChromeIdle } from '../../usePlayChromeIdle.js';
import { StudioChatRail } from './StudioChatRail.js';
import { StudioStageCard } from './StudioStageCard.js';
import { StudioFullBleed } from './StudioFullBleed.js';
import { useStageSource } from '../../useStageSource.js';
import { useStudioStatusPoll, defaultRailOpen } from './useStudioStatusPoll.js';
import { GameTheater } from '../../GameTheater.js';
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
} from '../../studioShelf.js';
import { DetailsPanel, type DetailsPaneId } from './StudioDetailsPanel.js';
import { DraftShareControl } from './DraftShareControl.js';
import { StudioShelfControls, StudioShelfList } from './StudioShelf.js';
import { defaultTabFor, resolveTab, studioAddress, tabAvailable } from './studioTabs.js';
import { healthFor } from './studioHealth.js';
import { SubmissionStatusView } from './SubmissionStatusView.js';
import {
  fetchStudioGames,
  fetchStudioHealth,
  fetchStudioScorecards,
  type StudioGame,
  type StudioScorecard,
} from '../../studioApi.js';
import type { EditorContentPush, EditorControllerState } from '../../editorBridge.js';
import './studio-connect.css';
import './studio-credentials.css';
import './studio-shell.css';
import './studio-panel.css';
import './studio-shelf.css';
import './studio-head-rail.css';
import './studio-stage.css';
import './studio-share.css';
import './studio-stats.css';

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
 * Shelf scales past a handful of games: compact rows, search/filter once the list grows.
 * On a desktop with a long shelf it collapses to a left-edge rail of dots (not a "switch
 * game" combo); expand it to get the full list back. On a phone with a game open the
 * shelf is never permanently in the page — it is a drawer over ~90% of the width. A
 * published game plus its improve tip share a slug — the shelf shows one row (the tip),
 * not the same title twice.
 *
 * Selection + surface live in the URL (`/studio/<slug>/<surface>`) so a refresh or a
 * shared link reopens the same place. The five old tab names still resolve, onto
 * whichever surface absorbed them.
 */

// Keep in step with the same breakpoint in styles.css.
const SHEET_MAX_WIDTH = 1099;
const SHEET_QUERY = `(max-width: ${SHEET_MAX_WIDTH}px)`;
// Matches styles.css. Height too: a landscape phone clears the width alone.
const SHELF_DRAWER_MAX_WIDTH = 800;
const SHELF_DRAWER_MAX_HEIGHT = 500;
const SHELF_DRAWER_QUERY = `(max-width: ${SHELF_DRAWER_MAX_WIDTH}px), (max-height: ${SHELF_DRAWER_MAX_HEIGHT}px)`;

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
  /** Deep-link that carries `/playtest`'s old meaning: open with play posture engaged. */
  selectedPosture?: 'play';
  onNavigate: (path: string, options?: NavigateOptions) => void;
  onPlay: (slug: string) => void;
  /** Loads a failed/abandoned concept back into the home hero prompt. */
  onRetryConcept?: (concept: string) => void;
};

export function CreatorStudioView({
  selectedGame,
  selectedTab,
  selectedPosture,
  onNavigate,
  onPlay,
  onRetryConcept,
}: CreatorStudioViewProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  /** Claim-handle modal — only opened when the creator asks to clear the publish gate. */
  const [claimOpen, setClaimOpen] = useState(false);
  const [games, setGames] = useState<StudioGame[]>([]);
  const [healthRows, setHealthRows] = useState<GameHealth[]>([]);
  const [scorecards, setScorecards] = useState<StudioScorecard[]>([]);
  const [healthDays, setHealthDays] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [shelfTruncated, setShelfTruncated] = useState(false);
  const [totalGames, setTotalGames] = useState(0);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abandonNotice, setAbandonNotice] = useState<string | null>(null);
  // Internally a game is its token — that is what every API call on this screen takes.
  // The URL says slug; the shelf is what translates between them.
  const [selected, setSelected] = useState<string | null>(null);
  // Synchronous mirror of `selected` for in-flight async checks.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  const [tab, setTab] = useState<StudioTab>(selectedTab ?? 'thread');
  // Lets the Code surface push a live param edit into the stage's frame (§E tier 1).
  const editorPushRef = useRef<EditorContentPush | null>(null);
  const [editorController, setEditorController] = useState<EditorControllerState | null>(null);
  const [editorSurfaceMode, setEditorSurfaceMode] = useState<'docked' | 'full'>('docked');
  const [shelfQuery, setShelfQuery] = useState('');
  const [shelfFilter, setShelfFilter] = useState<StudioShelfFilter>('all');
  /** Desktop rail expand, or mobile drawer open. Closed by default once a game is open. */
  const [shelfOpen, setShelfOpen] = useState(false);
  /** Manual rail collapse for a shelf below STUDIO_SHELF_TOOLS_AT. */
  const [shelfCollapsedByUser, setShelfCollapsedByUser] = useState(false);
  /** True when the shelf is the phone drawer (off-canvas), not the desktop rail. */
  const [shelfIsDrawer, setShelfIsDrawer] = useState(false);
  /** Header share control — draft link toggle/copy, not buried in Details → Overview. */
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  // Publishing is terminal, so an improvement on a live game opens a *new* job with its
  // own token — one not on the shelf yet. When that happens the open thread moves onto
  // it while the shelf selection stays on the source game (the new job inherits its slug,
  // so the chrome beside the thread is still right). Cleared whenever the selected game
  // changes, so switching games or following a link always lands on that game's own tip.
  const [handoffToken, setHandoffToken] = useState<string | null>(null);
  const shelfSearchId = useId();
  const shelfSearchRef = useRef<HTMLInputElement>(null!);
  const shelfOpenRef = useRef<HTMLButtonElement>(null!);
  const shareContainerRef = useRef<HTMLDivElement>(null);

  // What the URL is asking for, readable from inside the shelf fetch below without
  // making that fetch re-run every time the address changes. Seeded rather than
  // assigned in an effect because the case that matters is the first render: a deep
  // link arrives with the shelf request already in flight.
  const requestedGameRef = useRef(selectedGame);
  useEffect(() => {
    requestedGameRef.current = selectedGame;
  }, [selectedGame]);

  // One row per game. Refetch after abandon can reveal a sibling.
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

    Promise.all([fetchStudioGames(requestedGameRef.current), fetchStudioHealth(days)])
      .then(([shelfPage, health]) => {
        if (cancelled) return;
        const shelf = shelfPage.games;
        setGames(shelf);
        setShelfTruncated(shelfPage.truncated);
        setTotalGames(shelfPage.totalGames);
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
  useEffect(() => {
    setEditorSurfaceMode('docked');
    setEditorController(null);
  }, [activeGame?.token]);
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

  // The stage: always mounted, whether or not the creator asked to see it (the
  // game-first inversion's core claim — see docs/studio-game-first-implementation-plan.md).
  const stageToken = playtestGame?.token ?? null;
  const [posture, setPosture] = useState<StagePosture>('watch');
  const { idle: playChromeIdle, noteActivity: notePlayChromeActivity } = usePlayChromeIdle(
    shelfIsDrawer && posture === 'play',
  );
  // Captured once at mount, never updated: the URL-canonicalization effect below
  // rewrites `/playtest` onto its posture-free canonical form as soon as the game
  // resolves, which would otherwise race the reset effect and drop the deep link's
  // play posture before it ever applied.
  const initialSelectedPostureRef = useRef(selectedPosture);
  const firstStageTokenAppliedRef = useRef(false);
  const [activePreviewVersion, setActivePreviewVersion] = useState<string | null>(null);
  const studioStatus = useStudioStatusPoll(stageToken);
  const stageSource = useStageSource(stageToken ?? '', studioStatus, {
    selectedPreviewVersion: activePreviewVersion,
  });
  const [stageStatus, setStageStatus] = useState<StageStatus>({ kind: 'empty' });
  // "Fix it" seeds this; the composer consumes it once, then clears it.
  const [chatDraft, setChatDraft] = useState<{ text: string; seq: number } | null>(null);
  const [newerStageWaiting, setNewerStageWaiting] = useState(false);
  const [checklistUnread, setChecklistUnread] = useState(0);
  const [railManualOpen, setRailManualOpen] = useState<boolean | null>(null);
  const railOpen = railManualOpen ?? defaultRailOpen(studioStatus);
  // Distinct from `railOpen`: true only while the transcript body is actually visible.
  // The phone sheet can be `open` yet collapsed to its `peek` detent, showing just a
  // one-line preview — reported back by StudioChatRail so unread accounting below
  // doesn't treat peeking as having read what scrolled by.
  const [railVisiblyOpen, setRailVisiblyOpen] = useState(railOpen);
  const seenActivityRef = useRef(0);
  const latestActivityRef = useRef<string | null>(null);
  // The site's full `GameTheater` (fullscreen, share, report) — a heavier surface than
  // the stage's own play posture, opened deliberately rather than in place of it.
  const [theaterOpen, setTheaterOpen] = useState(false);
  // GameTheater documents that callers own page scroll-locking; SubmissionStatusView's
  // own copy of this effect is keyed to its own `playing` state and does not see this one.
  useEffect(() => {
    if (!theaterOpen) return;
    document.body.classList.add('player-open');
    return () => document.body.classList.remove('player-open');
  }, [theaterOpen]);

  // Theater z-index (1000) buries the popover (40) — close it instead.
  useEffect(() => {
    if (theaterOpen) setShareMenuOpen(false);
  }, [theaterOpen]);

  // A game switch starts every per-game bit of stage state fresh. The very first
  // resolution applies the deep link's posture (if any); every later switch — the
  // creator picking a different game — always starts back in watch.
  useEffect(() => {
    if (!stageToken) return;
    setActivePreviewVersion(null);
    if (!firstStageTokenAppliedRef.current) {
      firstStageTokenAppliedRef.current = true;
      setPosture(initialSelectedPostureRef.current === 'play' ? 'play' : 'watch');
    } else {
      setPosture('watch');
    }
    setStageStatus({ kind: 'empty' });
    setNewerStageWaiting(false);
    setChecklistUnread(0);
    setRailManualOpen(null);
    setTheaterOpen(false);
    setChatDraft(null);
    seenActivityRef.current = 0;
    latestActivityRef.current = null;
  }, [stageToken]);
  const selectedHealth = activeGame ? healthFor(activeGame, healthRows) : null;
  const selectedScorecard = activeGame?.slug
    ? (scorecards.find((card) => card.slug === activeGame.slug) ?? null)
    : null;
  const visibleGames = useMemo(
    () => filterStudioGames(shelfGames, { filter: shelfFilter, query: shelfQuery }),
    [shelfGames, shelfFilter, shelfQuery],
  );
  const showShelfTools = shelfGames.length >= STUDIO_SHELF_TOOLS_AT;
  // Long shelf auto-compacts; short shelf compacts only if manually collapsed.
  const compactShelf = Boolean(activeGame) && (showShelfTools || shelfCollapsedByUser);
  const shelfSummaryCount = shelfTruncated ? totalGames : shelfGames.length;
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
  /** Which Details icon-pane is open — Cursor-style strip, one job at a time. */
  const [detailsPane, setDetailsPane] = useState<DetailsPaneId>('overview');
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
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(SHELF_DRAWER_QUERY) : null;
    const sync = () =>
      setShelfIsDrawer(
        query
          ? query.matches
          : window.innerWidth <= SHELF_DRAWER_MAX_WIDTH || window.innerHeight <= SHELF_DRAWER_MAX_HEIGHT,
      );
    sync();
    query?.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      query?.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  function closeShelf({ restoreFocus = false }: { restoreFocus?: boolean } = {}) {
    setShelfOpen(false);
    if (restoreFocus) {
      // Escape / backdrop leave focus in the (now inert) search field otherwise.
      window.requestAnimationFrame(() => shelfOpenRef.current?.focus());
    }
  }

  useEffect(() => {
    if (!shelfOpen || !activeGame) return;
    const previous = document.body.style.overflow;
    // Only the phone drawer needs to freeze the page; the desktop rail expands in flow.
    if (shelfIsDrawer) document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => shelfSearchRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShelfOpen(false);
      // Hand focus back to the opener on the phone drawer; desktop rail collapse keeps
      // the edge toggle itself as the natural landing place.
      if (shelfIsDrawer) {
        window.requestAnimationFrame(() => shelfOpenRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener('keydown', onKey);
    };
  }, [shelfOpen, activeGame, shelfIsDrawer]);

  function selectGame(token: string) {
    const next = shelfGames.find((game) => game.token === token) ?? null;
    const nextTab = token === selected ? tab : defaultTabFor();
    setSelected(token);
    setTab(nextTab);
    closeShelf({ restoreFocus: shelfIsDrawer });
    if (next) onNavigate(studioPath(studioAddress(next), nextTab));
  }

  // Read by the Escape handler above, which is registered once per open rather than
  // re-registered on every render that changes what `openTab` closes over.
  const openTabRef = useRef((next: StudioTab) => {
    void next;
  });

  function openTab(next: StudioTab, options?: NavigateOptions) {
    if (!activeGame || !tabAvailable(activeGame, next)) return;
    setShareMenuOpen(false);
    setTab(next);
    if ((next === 'edit' || next === 'code' || next === 'details') && posture === 'play') {
      setPosture('watch');
    }
    const path = studioPath(studioAddress(activeGame), next);
    if (options) onNavigate(path, options);
    else onNavigate(path);
  }
  openTabRef.current = openTab;

  // Queued so the Code actions shortcut survives a switch from another tab.
  const [pendingCodeActions, setPendingCodeActions] = useState<{ mode: CodeActionsMode; nonce: number } | null>(null);
  const codeShortcutStateRef = useRef({ tab, activeGame, posture });
  codeShortcutStateRef.current = { tab, activeGame, posture };
  // Tab/posture to restore if the shortcut-opened menu gets cancelled.
  const forcedCodeReturnRef = useRef<{ tab: StudioTab; posture: StagePosture } | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isQuickOpen = key === 'p';
      const isSearch = key === 'f' && event.shiftKey;
      if (!isQuickOpen && !isSearch) return;
      const { tab: currentTab, activeGame: currentGame, posture: currentPosture } = codeShortcutStateRef.current;
      // CodeSurface owns the shortcut itself once Code is the open tab.
      if (currentTab === 'code' || !currentGame || !tabAvailable(currentGame, 'code')) return;
      event.preventDefault();
      forcedCodeReturnRef.current = { tab: currentTab, posture: currentPosture };
      setPendingCodeActions((current) => ({
        mode: isQuickOpen ? (event.shiftKey ? 'commands' : 'files') : 'search',
        nonce: (current?.nonce ?? 0) + 1,
      }));
      openTabRef.current('code');
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // Nothing was picked — undo the forced hop into Code.
  function handleCodeActionsMenuCancelled() {
    const restore = forcedCodeReturnRef.current;
    forcedCodeReturnRef.current = null;
    if (!restore) return;
    // Replaces the transient Code entry rather than stacking a third history entry.
    openTab(restore.tab, { replace: true });
    setPosture(restore.posture);
  }

  // Share is about the permalink, not about the draft switch: a game already live in
  // the catalog has nothing to toggle, but it still needs a way to hand the link out.
  // Hiding the control there left published games with no share affordance anywhere.
  const canShare = Boolean(activeGame && activeGame.slug && activeGame.lastKnownStatus !== 'abandoned');
  const shareIsLive = Boolean(activeGame && isStudioGameShelfLive(activeGame));
  const shareTitle = t(shareIsLive ? 'studioPanel.share.liveTitle' : 'studioPanel.share.title');

  useEffect(() => {
    setShareMenuOpen(false);
  }, [selected]);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShareMenuOpen(false);
    };
    // No backdrop, no Escape key — a tap outside closes it.
    const onPointerDown = (event: PointerEvent) => {
      if (shareContainerRef.current?.contains(event.target as Node)) return;
      setShareMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [shareMenuOpen]);

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
    <StudioCreatorProfileProvider>
      <section
        className={`studio-panel${posture === 'play' ? ' is-playtesting' : ''}${activeGame ? ' is-focused' : ''}`}
      >
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

        {/* Profile edit lives on /creators/:handle. Studio only claims at publish need. */}
        <ClaimHandleModal isOpen={claimOpen} onClose={() => setClaimOpen(false)} />

        {abandonNotice ? (
          <aside className="studio-abandon-notice" role="status" aria-live="polite">
            <PixelIcon name="trash" size={16} className="studio-abandon-notice__icon" />
            <p className="studio-abandon-notice__text">
              {t('studioPanel.overview.abandonNotice', { title: abandonNotice })}
            </p>
            <button
              type="button"
              className="studio-abandon-notice__close"
              onClick={() => setAbandonNotice(null)}
              aria-label={t('studioPanel.overview.abandonNoticeDismiss')}
              title={t('studioPanel.overview.abandonNoticeDismiss')}
            >
              <PixelIcon name="close" size={12} />
            </button>
          </aside>
        ) : null}

        {loading ? (
          <>
            {/* Claims the app shell for the length of the shelf fetch so the marketing
              footer (and this panel's lid) do not paint and then vanish the moment a
              game opens — bare /studio auto-picks one without naming it in the URL. */}
            <div className="studio-shell-pending" hidden />
            <p className="studio-empty">{t('studioPanel.loading')}</p>
          </>
        ) : null}
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
              // Long shelf on a desktop: collapse to a left-edge summary after pick.
              // Phones ignore this — they always use the drawer once a game is open.
              compactShelf ? 'is-compact-shelf' : '',
              shelfOpen ? 'is-shelf-open' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {activeGame && shelfOpen ? (
              <div
                className="modal-backdrop studio-shelf-backdrop"
                role="presentation"
                onClick={() => closeShelf({ restoreFocus: shelfIsDrawer })}
              />
            ) : null}

            {/* Phone drawer, closed: keep it out of the tab order and the accessibility tree.
              Desktop compact rail stays interactive while collapsed — only the drawer is
              off-canvas. `inert` is set via the DOM (React 18 does not wire the prop);
              aria-hidden covers AT that skips inert. */}
            <aside
              className="studio-shelf"
              aria-label={t('studioPanel.shelfAria')}
              aria-hidden={activeGame && shelfIsDrawer && !shelfOpen ? true : undefined}
              ref={(el) => {
                if (!el) return;
                const closed = Boolean(activeGame && shelfIsDrawer && !shelfOpen);
                if (closed) el.setAttribute('inert', '');
                else el.removeAttribute('inert');
              }}
            >
              <div className="studio-shelf-head">
                <h2 className="studio-shelf-heading">{t('studioPanel.shelf.heading')}</h2>
                <span className="studio-shelf-count">
                  {shelfTruncated
                    ? t('studioPanel.shelf.countTruncated', { shown: shelfGames.length, total: totalGames })
                    : t('studioPanel.shelf.count', { count: shelfGames.length })}
                </span>
                {activeGame ? (
                  <button
                    type="button"
                    className="studio-shelf-edge-toggle"
                    onClick={() => {
                      if (!compactShelf) {
                        // Short shelf, still expanded: collapse it into the rail.
                        setShelfCollapsedByUser(true);
                        return;
                      }
                      if (shelfOpen) closeShelf({ restoreFocus: shelfIsDrawer });
                      else setShelfOpen(true);
                    }}
                    aria-expanded={compactShelf ? shelfOpen : true}
                    aria-label={
                      !compactShelf || shelfOpen
                        ? t('studioPanel.shelf.collapseShelf')
                        : t('studioPanel.shelf.expandShelf')
                    }
                  >
                    <PixelIcon name={!compactShelf || shelfOpen ? 'collapse' : 'expand'} size={12} />
                  </button>
                ) : null}
              </div>
              {activeGame && compactShelf ? (
                <button
                  type="button"
                  className="studio-shelf-summary"
                  onClick={() => {
                    if (!showShelfTools) {
                      // Manual collapse: the folder button restores the shelf directly.
                      setShelfCollapsedByUser(false);
                      return;
                    }
                    setShelfOpen(true);
                  }}
                  aria-expanded={shelfOpen}
                  aria-label={t('studioPanel.shelf.expandShelf')}
                  title={
                    shelfTruncated
                      ? t('studioPanel.shelf.countTruncated', { shown: shelfGames.length, total: totalGames })
                      : t('studioPanel.shelf.count', { count: shelfGames.length })
                  }
                >
                  <PixelIcon name="folder" size={16} />
                  <span className="studio-shelf-summary-badge" aria-hidden="true">
                    {shelfSummaryCount > 99 ? '99+' : shelfSummaryCount}
                  </span>
                </button>
              ) : null}
              <button type="button" className="studio-shelf-new" onClick={() => onNavigate('/')}>
                <PixelIcon name="sparkle" size={12} />{' '}
                <span className="studio-shelf-new-label">{t('studioPanel.shelf.newGame')}</span>
              </button>
              <StudioShelfControls
                searchInputId={shelfSearchId}
                searchRef={shelfSearchRef}
                query={shelfQuery}
                filter={shelfFilter}
                showTools={showShelfTools || (shelfOpen && shelfGames.length > 1)}
                buildingCount={buildingCount}
                liveCount={liveCount}
                totalCount={shelfGames.length}
                onQueryChange={setShelfQuery}
                onFilterChange={setShelfFilter}
              />
              {shelfTruncated ? <p className="studio-shelf-truncated">{t('studioPanel.shelf.truncated')}</p> : null}
              {shelfList}
            </aside>

            {missingGame ? <p className="studio-empty studio-error">{t('studioPanel.gameNotFound')}</p> : null}

            {activeGame ? (
              <div className="studio-detail">
                {(() => {
                  const covered = shelfOpen || tab === 'details' || tab === 'edit' || tab === 'code';
                  // Drawer covers chat; keep its opener and rows clickable.
                  const chatCovered = shelfOpen || tab === 'details' || tab === 'edit';
                  const chatVisible = railOpen && !chatCovered;
                  const canClaim = Boolean(
                    !user?.handle &&
                    (activeGame.lastKnownStatus === 'in_review' || activeGame.lastKnownStatus === 'publishing'),
                  );
                  const backToFullBleed = () => {
                    if (shelfOpen) closeShelf({ restoreFocus: shelfIsDrawer });
                    if (tab !== 'thread') openTab('thread');
                  };
                  const changePosture = (next: StagePosture) => {
                    if (next === 'play' && covered) backToFullBleed();
                    setPosture(next);
                  };
                  const shareSlot = canShare ? (
                    <div className="studio-head-share" ref={shareContainerRef}>
                      <button
                        type="button"
                        className={`studio-head-action is-icon-only${shareMenuOpen ? ' is-active' : ''}`}
                        aria-pressed={shareMenuOpen}
                        aria-expanded={shareMenuOpen}
                        aria-label={shareTitle}
                        data-testid="studio-head-share"
                        onClick={() => setShareMenuOpen((open) => !open)}
                      >
                        <PixelIcon name="share" size={14} />{' '}
                        <span className="studio-head-action-label">{shareTitle}</span>
                      </button>
                      {shareMenuOpen ? (
                        <div className="studio-head-share-popover" role="dialog" aria-label={shareTitle}>
                          <DraftShareControl
                            game={activeGame}
                            compact
                            live={shareIsLive}
                            onSharedChange={(shared) => {
                              setGames((prev) =>
                                prev.map((game) =>
                                  game.token === activeGame.token ? { ...game, draftShared: shared } : game,
                                ),
                              );
                            }}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null;

                  return (
                    <>
                      <StudioStrip
                        title={activeGame.title}
                        slug={activeGame.slug ?? undefined}
                        status={studioStatus}
                        posture={posture}
                        onPostureChange={changePosture}
                        stageEmpty={!stageSource.html}
                        onOpenShelf={() => setShelfOpen(true)}
                        shelfOpenRef={shelfOpenRef}
                        shelfOpen={shelfOpen}
                        editAvailable={tabAvailable(activeGame, 'edit')}
                        editActive={tab === 'edit'}
                        onToggleEdit={() => openTab(tab === 'edit' ? 'thread' : 'edit')}
                        codeAvailable={tabAvailable(activeGame, 'code')}
                        codeActive={tab === 'code'}
                        onToggleCode={() => openTab(tab === 'code' ? 'thread' : 'code')}
                        onOpenBuild={() => {
                          setDetailsPane('build');
                          openTab('details');
                        }}
                        detailsActive={tab === 'details'}
                        onToggleDetails={() => {
                          if (tab === 'details') {
                            openTab('thread');
                            return;
                          }
                          setDetailsPane('overview');
                          openTab('details');
                        }}
                        threadOpen={chatVisible}
                        onToggleThread={() => {
                          const next = chatCovered || !railOpen;
                          setRailManualOpen(next);
                          if (next) {
                            if (chatCovered) openTab('thread');
                            seenActivityRef.current += checklistUnread;
                            setChecklistUnread(0);
                          }
                        }}
                        threadUnreadCount={checklistUnread}
                        canClaim={canClaim}
                        onClaim={() => setClaimOpen(true)}
                        shareSlot={shareSlot}
                        onOpenTheater={() => setTheaterOpen(true)}
                        isCompact={shelfIsDrawer}
                        isChromeIdle={playChromeIdle}
                        onExit={() => onNavigate('/')}
                      />

                      {theaterOpen ? (
                        stageSource.origin.kind === 'delivered' && activeGame.slug ? (
                          <GameTheater
                            title={activeGame.title}
                            badge={{ icon: 'gamepad', label: t('catalog.playingBadge', { defaultValue: 'Playing' }) }}
                            source={{ slug: activeGame.slug }}
                            onExit={() => setTheaterOpen(false)}
                          />
                        ) : stageSource.rawHtml ? (
                          <GameTheater
                            title={activeGame.title}
                            badge={{ icon: 'wrench', label: t('statusView.draftBadge') }}
                            source={{ html: stageSource.rawHtml }}
                            onExit={() => setTheaterOpen(false)}
                          />
                        ) : null
                      ) : null}

                      {/* The stage: always mounted, always full-bleed. Every surface below
                        is a layer over it, never a replacement for it (the ground-state
                        rule) — see docs/studio-game-first-implementation-plan.md Workstream C. */}
                      <div className="studio-stage-layout">
                        <StudioStage
                          // Remounts on game switch — StudioStage's own per-document caches
                          // (pendingHtml, lastGoodRef, …) must not carry over from the
                          // previous game (Codex review of PR #739).
                          key={playtestGame?.token ?? activeGame.token}
                          token={playtestGame?.token ?? activeGame.token}
                          title={activeGame.title}
                          slug={activeGame.slug ?? undefined}
                          editable={activeGame.editable}
                          published={playtestPublished}
                          source={stageSource}
                          posture={posture}
                          onPostureChange={setPosture}
                          covered={covered}
                          onStatusChange={setStageStatus}
                          onFixIt={(message) => {
                            setChatDraft({ text: t('studioPanel.stage.fixItPrompt', { message }), seq: Date.now() });
                            setRailManualOpen(true);
                          }}
                          onNewerStageWaiting={setNewerStageWaiting}
                          onImproved={(newToken) => setHandoffToken(newToken)}
                          editorPushRef={editorPushRef}
                          onEditorControllerChange={setEditorController}
                          onPlayActivity={notePlayChromeActivity}
                          publishedAt={activeGame.publishedAt ?? activeGame.livePublishedAt}
                          deliveryInGate={Boolean(studioStatus?.gateProgress)}
                          newerStageWaiting={newerStageWaiting}
                          checked={studioStatus?.previewGate ? studioStatus.previewGate.green : null}
                        />

                        {stageStatus.kind === 'empty' &&
                        !stageSource.html &&
                        studioStatus &&
                        studioStatus.status !== 'published' &&
                        studioStatus.status !== 'abandoned' &&
                        studioStatus.status !== 'needs_changes' ? (
                          <StudioStageCard status={studioStatus} />
                        ) : null}

                        {posture === 'watch' && !covered ? (
                          <StudioShotToasts
                            token={threadToken ?? activeGame.token}
                            placement="near-play"
                            onOpenMedia={() => {
                              setDetailsPane('media');
                              openTab('details');
                            }}
                          />
                        ) : null}

                        <StudioChatRail
                          title={activeGame.title}
                          open={railOpen}
                          covered={chatCovered}
                          onOpenChange={(next) => {
                            setRailManualOpen(next);
                            if (next) {
                              seenActivityRef.current += checklistUnread;
                              setChecklistUnread(0);
                            }
                          }}
                          unreadCount={checklistUnread}
                          latestEntryLabel={latestActivityRef.current}
                          onVisiblyOpenChange={setRailVisiblyOpen}
                        >
                          <SubmissionStatusView
                            key={threadToken ?? activeGame.token}
                            token={threadToken ?? activeGame.token}
                            embedded
                            draft={chatDraft}
                            onDraftConsumed={() => setChatDraft(null)}
                            justHandedOff={handoffToken != null}
                            onImproved={(newToken) => setHandoffToken(newToken)}
                            onPlaytest={() => changePosture('play')}
                            onOpenConnect={() => {
                              setDetailsPane('connect');
                              openTab('details');
                            }}
                            onActivityCount={(count, latest) => {
                              latestActivityRef.current = latest;
                              if (!railVisiblyOpen && count > seenActivityRef.current) {
                                setChecklistUnread(count - seenActivityRef.current);
                              } else if (railVisiblyOpen) {
                                seenActivityRef.current = count;
                                setChecklistUnread(0);
                              }
                            }}
                            onRetry={
                              onRetryConcept
                                ? (concept) => {
                                    onRetryConcept(concept);
                                    onNavigate('/');
                                  }
                                : undefined
                            }
                          />
                        </StudioChatRail>

                        {tab === 'edit' ? (
                          <div className="studio-edit-overlay" data-surface={editorSurfaceMode}>
                            <EditorPanel
                              key={activeGame.token}
                              game={activeGame}
                              editorPushRef={editorPushRef}
                              controller={editorController}
                              onSurfaceModeChange={setEditorSurfaceMode}
                              onOpenPlaytest={() => changePosture('play')}
                              onBack={() => openTab('thread')}
                            />
                          </div>
                        ) : null}

                        {tab === 'code' && activeGame.slug ? (
                          <div className="studio-edit-overlay studio-code-overlay">
                            <CodeSurface
                              key={activeGame.token}
                              slug={activeGame.slug}
                              onBack={() => openTab('thread')}
                              editorPushRef={editorPushRef}
                              pendingActionsMode={pendingCodeActions}
                              onPendingActionsModeConsumed={() => setPendingCodeActions(null)}
                              onPreviewReady={stageSource.pushPreview}
                              onActionsMenuCancelled={handleCodeActionsMenuCancelled}
                            />
                          </div>
                        ) : null}

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
                              <DetailsPanel
                                // Keyed on the game, so switching to another one gives a
                                // fresh panel rather than reusing this one's state.
                                key={activeGame.token}
                                game={activeGame}
                                mediaToken={threadToken ?? activeGame.token}
                                health={selectedHealth}
                                days={days}
                                healthDays={healthDays}
                                truncated={truncated}
                                scorecard={selectedScorecard}
                                pane={detailsPane}
                                onPaneChange={setDetailsPane}
                                onClose={() => openTab('thread')}
                                onDaysChange={setDays}
                                onOpenPlaytest={() => changePosture('play')}
                                onSelectPreviewVersion={setActivePreviewVersion}
                                activePreviewVersion={activePreviewVersion}
                                onReverted={(result) => {
                                  setActivePreviewVersion(null);
                                  if (result.token) {
                                    setHandoffToken(result.token);
                                  }
                                  openTab('thread');
                                }}
                                onSwitchToPlatform={async () => {
                                  await handoffToPlatform(activeGame.token);
                                  setDetailsPane('overview');
                                  openTab('thread');
                                }}
                                onPlay={() => activeGame.slug && onPlay(activeGame.slug)}
                                onDraftSharedChange={(shared) => {
                                  setGames((prev) =>
                                    prev.map((game) =>
                                      game.token === activeGame.token ? { ...game, draftShared: shared } : game,
                                    ),
                                  );
                                }}
                                onRemoved={async (token) => {
                                  const abandonedSlug = activeGame.slug;
                                  const abandonedTitle = activeGame.title;
                                  if (selectedRef.current === token) selectedRef.current = null;
                                  setSelected((current) => (current === token ? null : current));
                                  // Hide tip first; refetch may restore a published sibling.
                                  setGames((prev) => prev.filter((game) => game.token !== token));
                                  const fallbackToken = (list: readonly StudioGame[]) =>
                                    sortStudioGames(collapseStudioGames(list))[0]?.token ?? null;
                                  try {
                                    // Pass the slug so a live sibling below the shelf
                                    // ceiling is still returned (same deep-link path as
                                    // Open in Studio).
                                    const shelfPage = await fetchStudioGames(abandonedSlug);
                                    setGames(shelfPage.games);
                                    setShelfTruncated(shelfPage.truncated);
                                    setTotalGames(shelfPage.totalGames);
                                    // The creator may have picked another game while this
                                    // awaited.
                                    if (selectedRef.current !== null) return;
                                    const sibling =
                                      abandonedSlug &&
                                      shelfPage.games.find(
                                        (game) => game.slug === abandonedSlug && game.token !== token,
                                      );
                                    onNavigate(sibling && abandonedSlug ? studioPath(abandonedSlug) : studioPath());
                                    if (sibling) {
                                      setSelected(sibling.token);
                                    } else {
                                      setAbandonNotice(abandonedTitle);
                                      setSelected(fallbackToken(shelfPage.games));
                                    }
                                  } catch {
                                    // Optimistic remove stands if refetch fails.
                                    if (selectedRef.current !== null) return;
                                    onNavigate(studioPath());
                                    setAbandonNotice(abandonedTitle);
                                    setSelected(fallbackToken(games.filter((game) => game.token !== token)));
                                  }
                                }}
                              />
                            </aside>
                          </>
                        ) : null}

                        <StudioFullBleed visible={covered && !shelfOpen} onClick={backToFullBleed} />
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </StudioCreatorProfileProvider>
  );
}
