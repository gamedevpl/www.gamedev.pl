import type { DismissReason } from '@gamedevpl/contract';
import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../AuthContext.js';
import { AuthModal } from '../../AuthModal.js';
import { ClaimHandleModal } from '../../ClaimHandleModal.js';
import { StudioCreatorProfileProvider } from '../../studioCreatorProfile.js';
import type { GameHealth } from '../../healthApi.js';
import { PixelIcon, type PixelIconName } from '../../PixelIcon.js';
import { formatRelativeTime } from '../../relativeTime.js';
import { playPath, studioPath, type StudioTab } from '../../core/router.js';
import { abandonSubmission, deleteGame, handoffToPlatform } from '../../submissionApi.js';
import { StudioShotToasts } from './StudioShotToasts.js';
import { type CodeActionsMode } from './CodeActionsMenu.js';
import { CodeSurface } from './CodeSurface.js';
import { EditorPanel } from './EditorPanel.js';
import { StudioStage, type StagePosture, type StageStatus } from './StudioStage.js';
import { StudioStrip } from './StudioStrip.js';
import { usePlayChromeIdle } from '../../usePlayChromeIdle.js';
import { StudioVersionRibbon } from './StudioVersionRibbon.js';
import { StudioChatRail } from './StudioChatRail.js';
import { StudioStageCard } from './StudioStageCard.js';
import { StudioFullBleed } from './StudioFullBleed.js';
import { useStageSource, type StageOrigin } from '../../useStageSource.js';
import { useStudioStatusPoll, defaultRailOpen } from './useStudioStatusPoll.js';
import { GameTheater } from '../../GameTheater.js';
import {
  collapseStudioGames,
  filterStudioGames,
  isStudioGamePublished,
  isStudioGameShelfLive,
  sortStudioGames,
  studioGameInitials,
  STUDIO_LIVE_STATUSES,
  STUDIO_SHELF_TOOLS_AT,
  type StudioShelfFilter,
  type StudioShelfGame,
} from '../../studioShelf.js';
import { StudioConnectCard } from './StudioConnectCard.js';
import { StudioCreatorAgentKeyPanel } from './StudioCreatorAgentKeyPanel.js';
import { StudioDetailsBuildProgress } from './StudioDetailsBuildProgress.js';
import { StudioDetailsMedia } from './StudioDetailsMedia.js';
import { ContributionsSetting } from '../../ContributionsSetting.js';
import { formatSeconds } from '../../core/formatSeconds.js';
import { ProposalReviewPanel } from '../review/ProposalReviewPanel.js';
import { StudioOAuthClientsPanel } from './StudioOAuthClientsPanel.js';
import { StudioWorkspaceCheckoutPanel } from './StudioWorkspaceCheckoutPanel.js';
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

const WINDOWS = [1, 7, 30];

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
function tabAvailable(game: StudioGame, tab: StudioTab): boolean {
  // The Edit surface exists only for games whose latest build ships an editor
  // definition. Every other game keeps exactly the three surfaces it had — an
  // /edit URL for one of those resolves and falls back to the thread.
  if (tab === 'edit') return Boolean(game.editable && game.slug);
  // The Code surface (CE-06): every owned game with a slug, once the kill switch is
  // on — no manifest condition, unlike Edit, per the owner decision (all creators
  // from M1). `game.slug` still gates it: there is nothing to read or write before
  // the game has one.
  if (tab === 'code') return Boolean(game.codeSurface && game.slug);
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
  // What the ribbon should describe — the *displayed* document's origin, reported back
  // by the stage. Distinct from `stageSource.origin` (the latest fetched one) while a
  // swap is held during play: the ribbon must not claim a not-yet-applied build's
  // provenance for whatever's actually running.
  const [displayedOrigin, setDisplayedOrigin] = useState<StageOrigin>(stageSource.origin);
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
                          onDisplayedOriginChange={setDisplayedOrigin}
                          editorPushRef={editorPushRef}
                          onEditorControllerChange={setEditorController}
                          onPlayActivity={notePlayChromeActivity}
                        />

                        {stageStatus.kind === 'empty' &&
                        !stageSource.html &&
                        studioStatus &&
                        studioStatus.status !== 'published' &&
                        studioStatus.status !== 'abandoned' &&
                        studioStatus.status !== 'needs_changes' ? (
                          <StudioStageCard status={studioStatus} />
                        ) : null}

                        <StudioVersionRibbon
                          origin={displayedOrigin}
                          publishedAt={activeGame.publishedAt ?? activeGame.livePublishedAt}
                          stageStatus={stageStatus}
                          deliveryInGate={Boolean(studioStatus?.gateProgress)}
                          newerStageWaiting={newerStageWaiting}
                          checked={studioStatus?.previewGate ? studioStatus.previewGate.green : null}
                        />

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

/** Cursor-style Details strip — one pane at a time, chosen by icon. */
type DetailsPaneId = 'overview' | 'connect' | 'build' | 'media' | 'workspace' | 'keys' | 'stats';

type DetailsPaneDef = {
  id: DetailsPaneId;
  icon: PixelIconName;
  labelKey: string;
};

/**
 * The things beside the thread: when the game was made, how it is doing, who can play
 * it, and how to stop it. Everything here is *about* the game; the thread is where it
 * is talked to. Layout mirrors Cursor’s secondary icon rail — icons pick one pane.
 */
function DetailsPanel({
  game,
  mediaToken,
  health,
  days,
  healthDays,
  truncated,
  scorecard,
  pane,
  onPaneChange,
  onClose,
  onDaysChange,
  onOpenPlaytest,
  onSelectPreviewVersion,
  activePreviewVersion,
  onReverted,
  onSwitchToPlatform,
  onPlay,
  onDraftSharedChange,
  onRemoved,
}: {
  game: StudioShelfGame;
  /** Token for Media (and the active build round). Differs from `game.token` during handoff. */
  mediaToken?: string;
  health: GameHealth | null;
  days: number;
  healthDays: string[];
  truncated: boolean;
  scorecard: StudioScorecard | null;
  pane: DetailsPaneId;
  onPaneChange: (pane: DetailsPaneId) => void;
  onClose: () => void;
  onDaysChange: (days: number) => void;
  onOpenPlaytest: () => void;
  onSelectPreviewVersion?: (version: string | null) => void;
  activePreviewVersion?: string | null;
  onReverted?: (result: { version: string; token?: string; roundOpened?: number }) => void;
  onSwitchToPlatform: () => Promise<void>;
  onPlay: () => void;
  onDraftSharedChange: (shared: boolean) => void;
  onRemoved: (token: string) => void | Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  // This *job* is published — composer/playtest routing. Distinct from catalog-live below.
  const publishedJob = isStudioGamePublished(game);
  const catalogLive = isStudioGameShelfLive(game);
  const publishedAt = game.publishedAt ?? game.livePublishedAt;
  const [abandonArmed, setAbandonArmed] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const shotToken = mediaToken ?? game.token;

  async function handleAbandon() {
    if (!abandonArmed) {
      setAbandonArmed(true);
      return;
    }
    setAbandoning(true);
    try {
      await abandonSubmission(game.token);
      await onRemoved(game.token);
    } catch {
      setAbandoning(false);
      setAbandonArmed(false);
    }
  }

  async function handleDelete() {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteGame(game.token);
      await onRemoved(game.token);
    } catch {
      setDeleting(false);
      setDeleteArmed(false);
    }
  }

  const showConnect = game.lastKnownStatus !== 'abandoned' && game.lastKnownStatus !== 'published';
  // A published game's own status hides Build — but an improvement handoff runs a live
  // round under `mediaToken`, distinct from `game.token`, while `game` still reads published.
  const inHandoffRound = Boolean(mediaToken && mediaToken !== game.token);
  const showProgress = showConnect || inHandoffRound;
  const panes: DetailsPaneDef[] = [
    { id: 'overview', icon: 'eye', labelKey: 'studioPanel.rail.overview' },
    ...(showConnect ? [{ id: 'connect' as const, icon: 'signal' as const, labelKey: 'studioPanel.rail.connect' }] : []),
    ...(showProgress ? [{ id: 'build' as const, icon: 'wrench' as const, labelKey: 'studioPanel.rail.build' }] : []),
    { id: 'media', icon: 'image', labelKey: 'studioPanel.rail.media' },
    // No slug means no sources yet, and the route would refuse it.
    ...(game.slug && game.lastKnownStatus !== 'abandoned'
      ? [{ id: 'workspace' as const, icon: 'download' as const, labelKey: 'studioPanel.rail.workspace' }]
      : []),
    { id: 'keys', icon: 'lock', labelKey: 'studioPanel.rail.credentials' },
    ...(catalogLive ? [{ id: 'stats' as const, icon: 'star' as const, labelKey: 'studioPanel.rail.stats' }] : []),
  ];

  // If the open pane disappeared (e.g. published while on Connect), fall back.
  const activePane = panes.some((entry) => entry.id === pane) ? pane : 'overview';
  const activeLabel = t(panes.find((entry) => entry.id === activePane)?.labelKey ?? 'studioPanel.tabs.details');

  return (
    <div className="studio-rail-shell" data-testid="studio-rail-shell">
      <div className="studio-rail-head">
        <h3>{activeLabel}</h3>
        <button type="button" className="modal-close-btn" onClick={onClose} aria-label={t('studioPanel.close')}>
          <PixelIcon name="close" size={14} />
        </button>
      </div>

      <div className="studio-rail-pane studio-overview" data-testid={`studio-rail-pane-${activePane}`}>
        {activePane === 'overview' ? (
          <>
            <section className="studio-rail-section" aria-label={t('studioPanel.overview.status')}>
              <ul className="funnel-stats studio-facts">
                <li>
                  <span className="funnel-stat-value">
                    {formatRelativeTime(Date.parse(game.createdAt), i18n.language)}
                  </span>
                  <span className="funnel-stat-label">{t('studioPanel.overview.created')}</span>
                </li>
                {publishedAt ? (
                  <li>
                    <span className="funnel-stat-value">
                      {formatRelativeTime(Date.parse(publishedAt), i18n.language)}
                    </span>
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
                {catalogLive && game.slug ? (
                  <button type="button" className="primary-btn" onClick={onPlay}>
                    <PixelIcon name="play" size={12} /> {t('myGames.play')}
                  </button>
                ) : null}
                <button type="button" className="secondary-btn" onClick={onOpenPlaytest}>
                  <PixelIcon name="play" size={12} /> {t('studioPanel.overview.playtest')}
                </button>
                {!publishedJob && game.lastKnownStatus !== 'abandoned' ? (
                  <div className="studio-abandon-block">
                    {abandonArmed && !catalogLive ? (
                      <p className="studio-abandon-hint">{t('studioPanel.overview.abandonHintRemove')}</p>
                    ) : null}
                    <button
                      type="button"
                      className={`status-abandon${abandonArmed ? ' is-danger' : ''}`}
                      onClick={() => void handleAbandon()}
                      disabled={abandoning}
                    >
                      {abandonArmed
                        ? t(
                            catalogLive
                              ? 'studioPanel.overview.abandonConfirmKeepLive'
                              : 'studioPanel.overview.abandonConfirmRemove',
                          )
                        : t(catalogLive ? 'studioPanel.overview.abandon' : 'studioPanel.overview.abandonRemove')}
                    </button>
                  </div>
                ) : null}
                {catalogLive && game.lastKnownStatus !== 'abandoned' ? (
                  <div className="studio-delete-block">
                    {deleteArmed ? <p className="studio-delete-hint">{t('studioPanel.overview.deleteHint')}</p> : null}
                    <button
                      type="button"
                      className={`status-delete${deleteArmed ? ' is-danger' : ''}`}
                      onClick={() => void handleDelete()}
                      disabled={deleting}
                    >
                      {deleteArmed ? t('studioPanel.overview.deleteConfirm') : t('studioPanel.overview.delete')}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            {game.slug && game.lastKnownStatus !== 'abandoned' ? (
              <section
                className="studio-rail-section"
                aria-label={t(catalogLive ? 'studioPanel.share.liveTitle' : 'studioPanel.share.title')}
              >
                <DraftShareControl game={game} live={catalogLive} onSharedChange={onDraftSharedChange} />
              </section>
            ) : null}
          </>
        ) : null}

        {/*
         * Contributions live in the overview pane rather than getting a pane of their
         * own: for the great majority of games the answer is "off" and stays off, and a
         * tab per setting is how a rail becomes a menu. The review cards sit directly
         * under the switch that produced them, so turning it on and seeing what arrives
         * is one place rather than two.
         *
         * Only for a published game with a slug: there is nothing to propose against a
         * draft, and offering the switch there would promise a door that does not exist.
         */}
        {activePane === 'overview' && game.slug && catalogLive ? (
          <div className="studio-rail-contributions">
            <ContributionsSetting slug={game.slug} />
            <ProposalReviewPanel scope="mine" slug={game.slug} />
          </div>
        ) : null}

        {activePane === 'connect' ? (
          showConnect ? (
            <StudioConnectCard
              token={game.token}
              collapsible={false}
              hideIfUnavailable
              unavailableLabel={t('studioPanel.rail.connectEmpty')}
              density="panel"
              onSwitchToPlatform={onSwitchToPlatform}
            />
          ) : (
            <p className="studio-rail-empty">{t('studioPanel.rail.connectEmpty')}</p>
          )
        ) : null}

        {activePane === 'build' ? (
          showProgress ? (
            <StudioDetailsBuildProgress
              token={shotToken}
              emptyLabel={t('studioPanel.rail.buildEmpty')}
              onSelectPreviewVersion={onSelectPreviewVersion}
              activePreviewVersion={activePreviewVersion}
              onReverted={onReverted}
            />
          ) : (
            <p className="studio-rail-empty">{t('studioPanel.rail.buildEmpty')}</p>
          )
        ) : null}

        {activePane === 'media' ? (
          <StudioDetailsMedia token={shotToken} emptyLabel={t('studioPanel.rail.mediaEmpty')} />
        ) : null}

        {activePane === 'keys' ? (
          <div className="studio-rail-credentials-body">
            <p className="studio-rail-credentials-hint">{t('studioPanel.rail.credentialsHint')}</p>
            <StudioCreatorAgentKeyPanel />
            <StudioOAuthClientsPanel />
          </div>
        ) : null}

        {/* Own pane: behind the keys icon it was undiscoverable. */}
        {activePane === 'workspace' ? <StudioWorkspaceCheckoutPanel slug={game.slug as string} /> : null}

        {activePane === 'stats' && catalogLive ? (
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

      <nav className="studio-rail-icons" aria-label={t('studioPanel.tabs.details')}>
        {panes.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`studio-rail-icon${activePane === entry.id ? ' is-active' : ''}`}
            aria-pressed={activePane === entry.id}
            aria-label={t(entry.labelKey)}
            title={t(entry.labelKey)}
            data-testid={`studio-rail-icon-${entry.id}`}
            onClick={() => onPaneChange(entry.id)}
          >
            <PixelIcon name={entry.icon} size={14} />
          </button>
        ))}
      </nav>
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
 *
 * Once the game *is* live in the catalog there is no switch left to show — the link is
 * public by definition — but the creator still wants to hand it out, so `live` drops the
 * toggle and keeps the permalink and its copy button.
 */
function DraftShareControl({
  game,
  compact = false,
  live = false,
  onSharedChange,
}: {
  game: StudioGame;
  /** Drop the card chrome when nested in the header popover. */
  compact?: boolean;
  /** Game is live in the catalog: permalink only, no draft switch. */
  live?: boolean;
  onSharedChange?: (shared: boolean) => void;
}) {
  const { t } = useTranslation();
  const [shared, setShared] = useState(Boolean(game.draftShared));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Header popover unmounts this control on Escape / game switch; ignore the
  // in-flight toggle result so we do not setState after unmount.
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setShared(Boolean(game.draftShared));
  }, [game.draftShared, game.token]);

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
      if (!mountedRef.current) return;
      onSharedChange?.(next);
    } catch {
      if (!mountedRef.current) return;
      setShared(!next);
      setError(t('studioPanel.share.error'));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      if (!mountedRef.current) return;
      setCopied(true);
      window.setTimeout(() => {
        if (mountedRef.current) setCopied(false);
      }, 2000);
    } catch {
      // No clipboard permission or no clipboard API — the link is on screen to select
      // by hand, so this needs no error state.
    }
  }

  return (
    <div className={`studio-share${compact ? ' is-compact' : ''}${live ? ' is-live' : ''}`}>
      <div className="studio-share-head">
        <h3 className="studio-share-title">{t(live ? 'studioPanel.share.liveTitle' : 'studioPanel.share.title')}</h3>
        {live ? null : (
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
        )}
      </div>
      <p className="studio-share-hint">
        {t(live ? 'studioPanel.share.liveHint' : shared ? 'studioPanel.share.hintOn' : 'studioPanel.share.hintOff')}
      </p>
      {live || shared ? (
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
const DISMISS_REASON_KEYS: Array<[DismissReason, string]> = [
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
  if (suggestionClass === 'editorial') return t('studioPanel.suggestions.classEditorial');
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
