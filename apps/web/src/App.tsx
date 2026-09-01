import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { fetchCatalog, gamePageHandle, type CatalogEntry } from './catalog.js';
import { GameTheater } from './GameTheater.js';
import { NavHeader } from './NavHeader.js';
import { HeroPromptSection } from './HeroPromptSection.js';
import { ArcadeCatalog } from './surfaces/catalog/ArcadeCatalog.js';
import { UnpublishedPlayView } from './UnpublishedPlayView.js';
import { PixelIcon } from './PixelIcon.js';
import { CreatorQA, type QAQuestion } from './CreatorQA.js';
import { deriveTitleFromConcept } from './gameTitle.js';
import { MIN_CONCEPT_LENGTH } from './conceptLength.js';
import { resolveCreateInitialPrompt } from './createInitialPrompt.js';
import {
  adminPath,
  canonicalPath,
  connectPath,
  createPath,
  creatorPath,
  gamePath,
  NAVIGATE_EVENT,
  navUpTarget,
  parsePathRoute,
  partyPath,
  playPath,
  reviewPath,
  studioPath,
  studioWelcomePath,
  studioConnectPath,
  type AppRoute,
} from './core/router.js';
import { StudioWelcomeView } from './surfaces/studio/StudioWelcomeView.js';
import { StudioConnectWizard } from './surfaces/studio/StudioConnectWizard.js';
import type { PublicCreatorProfile } from './creatorProfileApi.js';
import { LegalPage } from './LegalPage.js';
import { ContactPage } from './ContactPage.js';
import { ConnectAgentsPage } from './ConnectAgentsPage.js';
import { CreatePage } from './CreatePage.js';
import { ProposalsPage } from './ProposalsPage.js';
import { CreatorProfilePage } from './CreatorProfilePage.js';
import { GamePage } from './GamePage.js';
import { GameDetailPage } from './GameDetailPage.js';
import { NotFoundPage } from './NotFoundPage.js';
import { PublicPlayView } from './PublicPlayView.js';
import { AppUpdateBanner } from './AppUpdateBanner.js';
import { InstallPrompt } from './InstallPrompt.js';
import { PullToRefresh } from './PullToRefresh.js';
import { SiteFooter } from './SiteFooter.js';
import { resolveDocumentTitle } from './pageTitle.js';
import { useDocumentTitle } from './useDocumentTitle.js';

// Deferred: an anonymous player playing a published game never has to pay for the
// weight of the admin console, the studio (and everything it drags in — the code
// editor, the remix panel), the review desk, or party's multiplayer client.
const AdminConsole = lazy(() => import('./surfaces/admin/AdminConsole.js').then((m) => ({ default: m.AdminConsole })));
const CreatorStudioView = lazy(() =>
  import('./surfaces/studio/CreatorStudioView.js').then((m) => ({ default: m.CreatorStudioView })),
);
const ReviewDesk = lazy(() => import('./surfaces/review/ReviewDesk.js').then((m) => ({ default: m.ReviewDesk })));
const PartyPage = lazy(() => import('./surfaces/party/PartyPage.js').then((m) => ({ default: m.PartyPage })));

/**
 * Catches a lazy route chunk's import() rejecting — a client that stayed open across
 * a deploy asks for a content-hashed filename the new build no longer serves, which
 * `apps/api/src/platform/app.ts`'s static handler hard-404s. Unlike `CodeSurface.tsx`'s
 * `CodeMirrorBoundary`, there is no lesser-but-working surface to degrade to here, so
 * the fallback is a reload prompt rather than a substitute — the same recovery the
 * service-worker shell's `AppUpdateBanner` already offers, for the client that has no
 * active worker to show it (registration unsupported, blocked, or not yet complete).
 */
class RouteChunkBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // Advisory only — the fallback's reload prompt is the whole recovery.
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * Read the current URL into an AppRoute, putting the browser on the current address
 * first — `/ay|/ai/<slug>` → `/play/<slug>`, `/status/<token>` → `/studio/<token>`,
 * `/health` → `/admin/telemetry`. The old address still works; it just does not stay
 * in the bar to be copied out of.
 */
function readLocationRoute(): AppRoute {
  const canonical = canonicalPath(window.location.pathname);
  if (canonical) {
    window.history.replaceState(null, '', canonical);
  }
  return parsePathRoute(window.location.pathname, window.location.hash);
}
import { submitSpec, refineSpec, type SubmissionApiError, type PlatformBuilderAvailability } from './submissionApi.js';
import { submissionErrorKey } from './submissionErrors.js';
import { useActiveBuildCount } from './activeBuilds.js';
import { getSavedSpecs, saveSpec, type SavedSpec } from './mySpecs.js';
import { saveLastBuilder, type BuilderKind } from './builderKind.js';
import { clearPendingQa, loadPendingQa, savePendingQa, type PendingQaAnswers } from './pendingQa.js';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import { BottomCta } from './BottomCta.js';
import { recordCreateStep, recordStudioStep, type PlayVia } from './visitTelemetry.js';
import { ClosedBetaSplash } from './ClosedBetaSplash.js';
import { BetaInvitePage } from './BetaInvitePage.js';
import { BetaWelcomeSplash } from './BetaWelcomeSplash.js';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { ControllerView } from './surfaces/party/ControllerView.js';
import { PartyStage } from './surfaces/party/PartyStage.js';
import { createPartySession, type PartySession } from './surfaces/party/mpApi.js';
import { parseOAuthReturnParam } from './oauthReturn.js';

type StageContent =
  | {
      type: 'catalog';
      game: CatalogEntry;
      initialRemixOpen?: boolean;
      initialRemixRequest?: string;
      // Which home page surface launched this play, if it did.
      via?: PlayVia;
    }
  | { type: 'party'; game: CatalogEntry; session: PartySession; via?: PlayVia };

export function App() {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading, privateBeta, publicPlaySlugs, showBetaWelcome, dismissBetaWelcome } = useAuth();
  const [route, setRoute] = useState(() => readLocationRoute());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const publicPlayAllowed = route.view === 'play' && publicPlaySlugs.includes(route.slug);

  // Catalog state
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);
  // Bumped by the catalog Retry control so a failed load can be re-fetched without
  // a full page reload (transient GitHub blips show up as 502s).
  const [catalogReloadKey, setCatalogReloadKey] = useState(0);

  // Local storage saved specs
  const [savedSpecs, setSavedSpecs] = useState<SavedSpec[]>(() => getSavedSpecs());
  // Bumped after a new submission so in-progress cards in the Games gallery appear.
  const [myGamesRefreshKey, setMyGamesRefreshKey] = useState(0);
  const [recommendationsRefreshKey, setRecommendationsRefreshKey] = useState(0);
  // Set by Studio's retry-concept flow; scrolled once home renders it.
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);
  // Idea loaded into the hero prompt by "try this again" on a failed/abandoned build.
  // A failed build usually needs an edit before it is worth another submission, so
  // this prefills rather than resubmitting.
  const [retryPrompt, setRetryPrompt] = useState<string | null>(null);
  // /party's Build-a-game seed — a ref, read by exactly one mount.
  const partySeedRef = useRef<string | null>(null);
  // Consumed by the render above; gone before any second read reaches it.
  useEffect(() => {
    partySeedRef.current = null;
  });

  // Stage content
  const [stageContent, setStageContent] = useState<StageContent | null>(null);
  // Builds actually in flight, from the server — the header badge's source of truth.
  // Paused while a game is on screen because the player covers the header.
  const activeBuildCount = useActiveBuildCount(myGamesRefreshKey, !stageContent);

  // Greenfield submission state
  // 'refining' is the spec-refiner call that precedes a submission — a few seconds
  // during which nothing has been submitted yet, so the UI must not claim otherwise.
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'refining' | 'loading'>('idle');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const submissionStatusRef = useRef(submissionStatus);
  submissionStatusRef.current = submissionStatus;

  // Clarifying-questions gate: a submission runs the spec refiner first, and when
  // it returns questions the creator must answer them before generation proceeds.
  // pendingSpec holds the spec awaiting those answers.
  // Seeded from localStorage so a reload mid-round resumes instead of throwing the
  // questions away and charging another refine to ask them again.
  const restoredQa = useRef(loadPendingQa());
  const [qaQuestions, setQaQuestions] = useState<QAQuestion[]>(restoredQa.current?.questions ?? []);
  const [pendingSpec, setPendingSpec] = useState<{ title: string; concept: string; displayName: string } | null>(
    restoredQa.current?.spec ?? null,
  );
  // Kept out of pendingSpec — too large for its localStorage-backed persistence.
  const pendingReferenceImagesRef = useRef<string[] | undefined>(undefined);
  // Language the parked questions were written in. Empty when an older blob never
  // recorded one — that mismatch with the live UI language is what triggers a
  // one-shot re-ask so English chips don't stick under a Polish chrome.
  const [qaLocale, setQaLocale] = useState<string>(restoredQa.current?.locale ?? '');
  // Who builds this round — parked with the confirm session so a reload keeps it.
  const [qaBuilder, setQaBuilder] = useState<BuilderKind>(restoredQa.current?.builder ?? 'platform');
  const qaBuilderRef = useRef(qaBuilder);
  qaBuilderRef.current = qaBuilder;
  // Whether the Gamedev.pl (platform) builder can be picked right now — reported by the
  // hero's own quota poll, which already fetches this alongside the daily allowance.
  const [platformBuilderAvailability, setPlatformBuilderAvailability] = useState<PlatformBuilderAvailability>();
  // Bumped when questions are rewritten for a new language so CreatorQA remounts
  // with empty answers — English chip labels must not survive as "selected" under
  // Polish options that no longer match.
  const [qaFormKey, setQaFormKey] = useState(0);
  // Kept next to the QA state so the language-switch effect can clear it too.
  const latestAnswersRef = useRef<PendingQaAnswers>(restoredQa.current?.answers ?? { selected: {}, custom: {} });

  // Demo generator state

  // Multiplayer lobby state
  const [partyError, setPartyError] = useState<string | null>(null);
  // Unpublished `/play/<slug>` title, reported once the document loads.
  const [unpublishedPlayTitle, setUnpublishedPlayTitle] = useState<string | null>(null);
  /** Display name for `/:handle` once the public profile loads. */
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [gameTitle, setGameTitle] = useState<string | null>(null);

  // Tab title follows the route (and any known game/submission/draft name). App is
  // the single writer — children report names upward rather than touching document.title.
  const documentTitle = useMemo(() => {
    const stageTitle = stageContent ? stageContent.game.title : null;
    const playTitle =
      route.view === 'play'
        ? (catalogEntries.find((game) => game.slug === route.slug)?.title ??
          unpublishedPlayTitle ??
          (stageContent?.type === 'catalog' && stageContent.game.slug === route.slug ? stageContent.game.title : null))
        : null;
    // Matched on either address the URL can carry: a slug now, a capability token on
    // links minted before games had one.
    const studioTitle =
      (route.view === 'studio' || route.view === 'studioWelcome' || route.view === 'studioConnect') && route.game
        ? (savedSpecs.find((spec) => spec.token === route.game || spec.slug === route.game)?.title ?? null)
        : null;

    return resolveDocumentTitle(route, {
      copy: {
        home: t('pageTitle.home'),
        join: t('pageTitle.join'),
        invite: t('pageTitle.invite'),
        health: t('pageTitle.health'),
        review: t('pageTitle.review'),
        studio: t('pageTitle.studio'),
        privacy: t('legal.privacy'),
        terms: t('legal.terms'),
        contact: t('pageTitle.contact'),
        connect: t('pageTitle.connect'),
        create: t('pageTitle.create'),
        party: t('pageTitle.party'),
        proposals: t('pageTitle.proposals'),
        notFound: t('pageTitle.notFound'),
        playNamed: t('pageTitle.playNamed'),
        studioNamed: t('pageTitle.studioNamed'),
        creatorNamed: t('pageTitle.creatorNamed'),
        gameNamed: t('pageTitle.gameNamed'),
      },
      playTitle,
      studioTitle,
      creatorName: route.view === 'creator' ? creatorName : null,
      gameTitle: route.view === 'game' ? gameTitle : null,
      // Only surface ephemeral theaters while still on home — `/play/<slug>` already
      // carries its own title via playTitle, and leaving home must restore the home title.
      stageTitle: route.view === 'home' ? stageTitle : null,
    });
  }, [route, stageContent, catalogEntries, savedSpecs, unpublishedPlayTitle, creatorName, gameTitle, t]);

  useDocumentTitle(documentTitle);

  // Drop the previous creator's display name as soon as the handle in the URL changes,
  // so the tab title falls back to the handle until the next profile loads.
  const creatorRouteHandle = route.view === 'creator' ? route.handle : null;
  useEffect(() => {
    setCreatorName(null);
  }, [creatorRouteHandle]);

  // Same for the game page: title falls back to the humanized slug between games.
  const gameRouteSlug = route.view === 'game' ? route.slug : null;
  useEffect(() => {
    setGameTitle(null);
  }, [gameRouteSlug]);

  useEffect(() => {
    // popstate covers back/forward (and path changes via history API). hashchange
    // is required for hybrid join URLs: the credential lives in the fragment, and
    // editing only the hash (paste `/join/<code>#<token>` while already on that
    // path) does not fire popstate.
    const syncRoute = () => {
      setRoute(readLocationRoute());
    };

    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
    };
  }, []);

  // Lock page scroll while the full-viewport game player is open so the fixed
  // overlay is the only scrollable surface (the game handles its own scroll).
  useEffect(() => {
    if (!stageContent) return;
    document.body.classList.add('player-open');
    return () => document.body.classList.remove('player-open');
  }, [stageContent]);

  // `/play/<slug>` auto-opens theater once the catalog confirms the game.
  // Close replaces onto the canonical page; in-place Play is untouched.
  useEffect(() => {
    if (stageContent?.type === 'catalog') {
      const entry = catalogEntries.find((game) => game.slug === stageContent.game.slug);
      if (entry && stageContent.game !== entry) {
        setStageContent((prev) =>
          prev?.type === 'catalog' && prev.game.slug === entry.slug ? { ...prev, game: entry } : prev,
        );
      }
      if (route.view === 'play' && catalogStatus === 'ready' && !entry) {
        setStageContent(null);
      }
      return;
    }

    if (route.view !== 'play') return;
    const entry = catalogEntries.find((game) => game.slug === route.slug);
    // Wait so unknown slugs do not flash a 404 theater.
    if (catalogStatus !== 'ready' || !entry) return;

    setStageContent({ type: 'catalog', game: entry });
  }, [route, catalogEntries, catalogStatus, stageContent]);

  // Guard against accidental reload/close while a game is open. The browser shows
  // its native "Leave site?" confirmation; games run in a sandboxed iframe with no
  // access to parent storage, so their internal progress can't be persisted here —
  // this at least prevents losing it by a stray Cmd-R.
  useEffect(() => {
    if (!stageContent) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [stageContent]);

  useEffect(() => {
    // Wait until /api/health has told us whether PRIVATE_BETA is on — privateBeta
    // defaults to false, so fetching before that would 401-spam (and log noise) for
    // every anonymous visitor during closed beta.
    if (authLoading) return;
    // Promotional deep links load the game directly, without opening the catalog.
    if (publicPlayAllowed) return;
    // In private-beta mode /api/catalog requires a session — an anonymous fetch
    // would just 401. Don't fetch (and don't render an error) until signed in.
    // Outside private beta, catalog reads stay public (owner decision).
    if (privateBeta && !user) return;
    // Home, /play, /create, and /party all need the catalog loaded.
    if (route.view !== 'home' && route.view !== 'play' && route.view !== 'create' && route.view !== 'party') return;

    let cancelled = false;
    // Soft refreshes (Retry, pull-to-refresh) keep the last-good grid on screen —
    // flipping to `loading` would blank the arcade for every pull. First load and
    // recovering from an error still show the busy mascot.
    setCatalogStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    // Clear a previous soft-refresh notice as soon as another attempt starts, so the
    // banner does not linger over a grid that is already being re-fetched.
    setCatalogError(null);

    void fetchCatalog()
      .then((entries) => {
        if (cancelled) return;
        setCatalogEntries(entries);
        setCatalogError(null);
        setCatalogStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Keep whatever was on screen if a soft refresh fails — a transient 502
        // should not erase a catalog the visitor was already browsing. The error
        // still lands in `catalogError` so ArcadeCatalog can show a non-blocking
        // refresh-failed banner above the last-good grid (full error UI only when
        // there was nothing to keep).
        setCatalogEntries((prev) => (prev.length > 0 ? prev : []));
        setCatalogError(err instanceof Error ? err.message : null);
        setCatalogStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
      });

    return () => {
      cancelled = true;
    };
  }, [user, privateBeta, authLoading, publicPlayAllowed, route.view, catalogReloadKey]);

  const handleRetryCatalog = useCallback(() => {
    setCatalogReloadKey((n) => n + 1);
  }, []);

  // Soft-refresh the home surfaces the installed PWA cannot reach with the browser's
  // own pull-to-refresh (standalone display mode has no chrome gesture). Bumping the
  // same keys Retry / post-play already use keeps recommendations and "My games" in
  // sync with the catalog list.
  const handlePullToRefresh = useCallback(async () => {
    setCatalogReloadKey((n) => n + 1);
    setRecommendationsRefreshKey((n) => n + 1);
    setMyGamesRefreshKey((n) => n + 1);
    // Give the catalog effect a beat to settle before the indicator dismisses. The
    // fetch itself is raced by the effect; we only need the gesture to feel finished.
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 450);
    });
  }, []);

  // The static chrome follows the language switcher instantly; the AI questions do
  // not — they were authored in whatever language the refine call used. Re-ask when
  // the UI language changes mid-round (or a restored session was parked under a
  // different language) so a Polish UI never keeps showing English chips.
  const qaRelocalizingRef = useRef(false);
  const pendingSpecRef = useRef(pendingSpec);
  pendingSpecRef.current = pendingSpec;
  useEffect(() => {
    const parked = pendingSpecRef.current;
    if (!parked) return;
    const targetLocale = i18n.resolvedLanguage ?? i18n.language;
    if (qaLocale === targetLocale) return;
    // A real submit is in flight — don't yank the questions out from under it.
    if (submissionStatusRef.current === 'loading') return;
    if (qaRelocalizingRef.current) return;

    let cancelled = false;
    qaRelocalizingRef.current = true;
    setSubmissionStatus('refining');
    const concept = parked.concept;

    async function relocalizeQa() {
      try {
        const refined = await refineSpec({ concept, locale: targetLocale });
        if (cancelled) return;
        // A real submit started while refine was in flight — drop the relocalization.
        if (submissionStatusRef.current === 'loading') return;

        const questions = refined.questions;
        // Fail-open: when Vertex times out or errors, it returns empty questions.
        // Keep the existing questions and parked session instead of wiping them into a name-only panel.
        if (questions.length === 0) return;

        // Prefer the live parked spec so a title edit mid-flight is not overwritten.
        const liveSpec = pendingSpecRef.current;
        if (!liveSpec) return;

        // Preserve user-entered custom answers across questions matching by ID or index.
        const oldCustom = latestAnswersRef.current.custom ?? {};
        const oldQuestions = qaQuestions;
        const preservedCustom: Record<string, string> = {};

        questions.forEach((newQ, idx) => {
          const customById = oldCustom[newQ.id];
          const oldQ = oldQuestions[idx];
          const customByIndex = oldQ ? oldCustom[oldQ.id] : undefined;
          const val = customById || customByIndex;
          if (val && val.trim()) {
            preservedCustom[newQ.id] = val;
          }
        });

        const newAnswers: PendingQaAnswers = { selected: {}, custom: preservedCustom };

        setQaQuestions(questions);
        setQaLocale(targetLocale);
        latestAnswersRef.current = newAnswers;
        // Drop restored answers so a remounted panel doesn't revive English selections.
        if (restoredQa.current) {
          restoredQa.current = {
            ...restoredQa.current,
            questions,
            answers: newAnswers,
            locale: targetLocale,
            savedAt: Date.now(),
          };
        }
        savePendingQa({
          spec: liveSpec,
          questions,
          answers: newAnswers,
          locale: targetLocale,
          builder: qaBuilderRef.current,
        });
        setQaFormKey((key) => key + 1);
      } catch {
        // Keep the previous questions rather than blanking the panel on a blip.
      } finally {
        qaRelocalizingRef.current = false;
        if (!cancelled && submissionStatusRef.current === 'refining') {
          setSubmissionStatus('idle');
        }
      }
    }

    void relocalizeQa();
    return () => {
      cancelled = true;
      // Strict Mode remounts (and a follow-up language flip) must be allowed to start
      // a new call; leaving the guard latched would park the panel on "analyzing".
      qaRelocalizingRef.current = false;
    };
    // Depend on the concept, not the whole pendingSpec object: title edits must not
    // cancel and restart a language switch mid-flight. submissionStatus is read to
    // skip during submit; listing it would cancel the relocalize when we flip to
    // 'refining' ourselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [i18n.language, i18n.resolvedLanguage, pendingSpec?.concept, qaLocale]);

  // Menu navigation is scroll-to-section, but the sections only exist on the home
  // route — from a status page we have to go home first and scroll once the target
  // has mounted (the Games gallery may still be loading).
  useEffect(() => {
    if (!pendingScrollTarget || route.view !== 'home') return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      const element = document.getElementById(pendingScrollTarget);
      if (element) {
        element.scrollIntoView?.({ behavior: 'smooth' });
      }
      // Give a still-loading section a moment to appear, then stop either way.
      if (element || (attempts += 1) > 20) {
        window.clearInterval(timer);
        setPendingScrollTarget(null);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [pendingScrollTarget, route.view]);

  // MCP OAuth: `/oauth/authorize` redirects here when the browser has no session.
  // After sign-in, resume the authorize URL so the agent gets its PKCE code.
  useEffect(() => {
    if (authLoading) return;
    const oauthReturn = parseOAuthReturnParam(window.location.search);
    if (!oauthReturn) return;
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    window.location.replace(oauthReturn);
  }, [authLoading, user]);

  // The generation gate: before spending a submission we run the spec refiner. If it
  // returns clarifying questions, generation pauses on the QA panel until they're
  // answered; a clean spec submits straight through. A refiner error stops here too.
  async function handleSubmitSpec(concept: string, displayName: string = '', referenceImages?: string[]) {
    if (!user) {
      // The wall between "wrote an idea" and "made an account". Everything before this
      // is anonymous, so this is the only place that drop-off is visible at all.
      recordCreateStep('signin_required');
      setIsAuthModalOpen(true);
      return;
    }

    const trimmedConcept = concept.trim();
    if (!trimmedConcept) return;

    // Catch a too-short concept before the fail-open refiner would.
    if (trimmedConcept.length < MIN_CONCEPT_LENGTH) {
      setSubmissionError(t('errors.conceptTooShort', { minLength: MIN_CONCEPT_LENGTH }));
      return;
    }

    setSubmissionStatus('refining');
    setSubmissionError(null);

    let questions: QAQuestion[];
    let suggestedTitle: string | undefined;
    try {
      const refined = await refineSpec({ concept: trimmedConcept, locale: i18n.language });
      questions = refined.questions;
      suggestedTitle = refined.suggestedTitle;
    } catch {
      // Fail-closed: stop here and let the creator retry, rather than falling
      // through to a truncated title as if refinement had succeeded.
      setSubmissionError(t('errors.refineFailed'));
      setSubmissionStatus('idle');
      return;
    }

    if (questions.length > 0) recordCreateStep('qa_shown');

    // The confirm step always happens now, questions or not: it is where the game gets
    // its name, and a build must not start without one the creator has seen.
    const spec = {
      title: suggestedTitle ?? deriveTitleFromConcept(trimmedConcept),
      concept: trimmedConcept,
      displayName: displayName.trim(),
    };
    const locale = i18n.resolvedLanguage ?? i18n.language;
    pendingReferenceImagesRef.current = referenceImages;
    setPendingSpec(spec);
    setQaQuestions(questions);
    setQaLocale(locale);
    setQaBuilder('platform');
    latestAnswersRef.current = { selected: {}, custom: {} };
    savePendingQa({
      spec,
      questions,
      answers: { selected: {}, custom: {} },
      locale,
      builder: 'platform',
    });
    setQaFormKey((key) => key + 1);
    setSubmissionStatus('idle');
  }

  // Actually creates the submission (after the QA gate) and jumps to its status page.
  async function submitRefinedSpec(title: string, concept: string, displayName: string, builder: BuilderKind) {
    setSubmissionStatus('loading');
    setSubmissionError(null);

    try {
      const response = await submitSpec({
        title,
        concept,
        displayName: displayName || undefined,
        // The agent is told this, so its progress updates arrive already written in
        // the creator's language rather than machine-translated afterwards.
        locale: i18n.language,
        builder,
        referenceImages: pendingReferenceImagesRef.current,
      });

      // Save to localStorage
      const updatedSpecs = saveSpec({
        token: response.token,
        title,
        concept,
        createdAt: Date.now(),
        ...(response.slug ? { slug: response.slug } : {}),
      });
      setSavedSpecs(updatedSpecs);
      setMyGamesRefreshKey((key) => key + 1);
      saveLastBuilder(response.token, builder);

      setSubmissionStatus('idle');
      recordCreateStep('submission_created', builder);
      recordStudioStep('builder_chosen', builder);

      // Only now is the QA panel done: it stayed up, in its submitting state, for the
      // whole call. A no-op when the spec never went through the gate.
      setQaQuestions([]);
      setPendingSpec(null);
      pendingReferenceImagesRef.current = undefined;
      setQaLocale('');
      setQaBuilder('platform');
      clearPendingQa();

      // Platform → welcome; self → connect chapter. Never auto-enter Studio.
      const address = response.slug ?? response.token;
      navigate(builder === 'platform' ? studioWelcomePath(address) : studioConnectPath(address));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic');
      const apiErr = err instanceof Error ? (err as SubmissionApiError) : undefined;
      setSubmissionError(
        t(
          submissionErrorKey({
            message,
            ...(apiErr?.status !== undefined ? { status: apiErr.status } : {}),
            ...(apiErr?.category !== undefined ? { category: apiErr.category } : {}),
          }),
        ),
      );
      setSubmissionStatus('idle');
    }
  }

  // The panel stays mounted until the submission actually lands. Clearing it first
  // dropped the creator into blank space for however long the API took to create the
  // issue — they had just clicked a button and the page answered by deleting itself.
  // On failure it stays up with the error, so the answers survive a retry.
  const handleQaComplete = async (finalConcept: string, title: string, builder: BuilderKind) => {
    const spec = pendingSpec;
    if (!spec) return;
    // The name the creator settled on, which is the step that gates the build.
    recordCreateStep('title_confirmed');
    await submitRefinedSpec(title, finalConcept, spec.displayName, builder);
  };

  const handleQaCancel = () => {
    setQaQuestions([]);
    setPendingSpec(null);
    pendingReferenceImagesRef.current = undefined;
    setQaLocale('');
    setQaBuilder('platform');
    clearPendingQa();
  };

  // Every keystroke and chip lands in storage, so the round survives a reload at any
  // point rather than only between questions.
  const handleQaAnswersChange = useCallback(
    (answers: PendingQaAnswers) => {
      latestAnswersRef.current = answers;
      if (!pendingSpec) return;
      savePendingQa({
        spec: pendingSpec,
        questions: qaQuestions,
        answers,
        locale: qaLocale,
        builder: qaBuilder,
      });
    },
    [pendingSpec, qaQuestions, qaLocale, qaBuilder],
  );

  // The name is parked with the answers, for the same reason: an edited title is work,
  // and a reload that kept the answers but silently restored the model's suggestion
  // would be the one part of the panel that lies about having been saved.
  const handleQaTitleChange = useCallback(
    (title: string) => {
      if (!pendingSpec) return;
      const spec = { ...pendingSpec, title };
      setPendingSpec(spec);
      savePendingQa({
        spec,
        questions: qaQuestions,
        answers: latestAnswersRef.current,
        locale: qaLocale,
        builder: qaBuilder,
      });
    },
    [pendingSpec, qaQuestions, qaLocale, qaBuilder],
  );

  const handleQaBuilderChange = useCallback(
    (builder: BuilderKind) => {
      setQaBuilder(builder);
      if (!pendingSpec) return;
      savePendingQa({
        spec: pendingSpec,
        questions: qaQuestions,
        answers: latestAnswersRef.current,
        locale: qaLocale,
        builder,
      });
    },
    [pendingSpec, qaQuestions, qaLocale],
  );

  // Track where a full-viewport /play overlay was opened from within the app
  // (e.g. from Creator Studio /studio/...), so closing it returns to that opener.
  const playReturnPathRef = useRef<string | null>(null);

  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    // When navigating to a /play route from elsewhere in the app, record the
    // origin path so exitOverlay can return to it.
    if (path.startsWith('/play/') && !window.location.pathname.startsWith('/play/')) {
      playReturnPathRef.current = window.location.pathname + window.location.search;
    }

    // Update the URL (the source of truth) and the route synchronously so
    // navigation is immediate (and testable) without waiting for popstate.
    if (options?.replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
    // pushState/replaceState are silent, so announce the navigation for anything
    // living outside this component (see NAVIGATE_EVENT). Dispatched before the
    // state update so a listener reading window.location sees the URL we just set.
    window.dispatchEvent(new CustomEvent(NAVIGATE_EVENT, { detail: { path } }));
    setRoute(readLocationRoute());
  }, []);

  /**
   * Closing a full-viewport overlay that owns the URL — unpublished draft or public play.
   * Returns to the in-app opener (e.g. Creator Studio) if launched from within the app,
   * or safely falls back to Home (`/`) on direct visits.
   */
  const exitOverlay = useCallback(() => {
    const returnPath = playReturnPathRef.current;
    playReturnPathRef.current = null;
    if (returnPath && !returnPath.startsWith('/play/')) {
      navigate(returnPath);
      return;
    }
    navigate('/');
  }, [navigate]);

  // Unpublished `/play/<slug>` uses UnpublishedPlayView's own theater (not `stageContent`),
  // so hide Up the same way — Close / the error home link own escape there.
  // Only after the catalog is ready: a catalog *error* must keep GameDetailPage's
  // retry UI, not look like a missing draft.
  const playCatalogGame =
    route.view === 'play' ? (catalogEntries.find((game) => game.slug === route.slug) ?? null) : null;
  const unpublishedPlayTheater = route.view === 'play' && catalogStatus === 'ready' && !playCatalogGame;

  // Header Up chevron — Android-style parent path, never history.back(). Hidden
  // while a theater owns the viewport (`stageContent`, unpublished play, studio playtest).
  const headerUp = useMemo(() => {
    if (stageContent || unpublishedPlayTheater) return null;
    const target = navUpTarget(route);
    if (!target) return null;
    return { path: target.path, ariaLabel: t(`header.${target.labelKey}`) };
  }, [route, stageContent, unpublishedPlayTheater, t]);

  // Deliberate click focuses even on phones, unlike page-load autofocus.
  function handleCreateNav() {
    flushSync(() => {
      navigate(createPath());
    });
    // A new page starts at the top, not the old offset.
    window.scrollTo(0, 0);
    const input = document.querySelector<HTMLTextAreaElement>('#hero-prompt .big-prompt-input');
    input?.focus({ preventScroll: true });
  }

  // Same handoff as Create, concept pre-loaded with party framing.
  function handlePartyCreateNav() {
    partySeedRef.current = t('party.customStarterPrompt');
    flushSync(() => {
      navigate(createPath());
    });
    window.scrollTo(0, 0);
    const input = document.querySelector<HTMLTextAreaElement>('#hero-prompt .big-prompt-input');
    if (input) {
      input.focus({ preventScroll: true });
      // Cursor at the end so typing continues the sentence, not overwrites it.
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }

  // A real destination now, not a scroll to the home rail.
  function handlePartyNav() {
    navigate(partyPath());
    // A new page starts at the top, not mid-scroll.
    window.scrollTo(0, 0);
  }

  function handleConnectNav() {
    navigate(connectPath());
    window.scrollTo(0, 0);
  }

  // Play lives on home only. Elsewhere, queue the anchor and go there — the
  // existing pending-scroll effect resolves it once the target (which may still be
  // loading) has actually mounted.
  function handleHomeAnchorNav(anchorId: string) {
    if (route.view === 'home') {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setPendingScrollTarget(anchorId);
    navigate('/');
  }

  const navHeader = {
    activeBuildCount,
    onHome: () => navigate('/'),
    onStudio: () => navigate(studioPath()),
    onAdmin: () => navigate(adminPath()),
    onReview: () => navigate(reviewPath()),
    onCreate: handleCreateNav,
    onPlay: () => handleHomeAnchorNav('play-anchor'),
    onParty: handlePartyNav,
    onConnect: handleConnectNav,
    upTarget: headerUp,
    onUp: navigate,
  };

  function handlePlayGame(game: CatalogEntry, via?: PlayVia) {
    // In-place Play from home/profile/game page; `/play/<slug>` auto-opens itself.
    const fullEntry = catalogEntries.find((e) => e.slug === game.slug) ?? game;
    setStageContent({ type: 'catalog', game: fullEntry, ...(via === undefined ? {} : { via }) });
    // Soft refresh so "continue" / genre picks update after the next home visit.
    setRecommendationsRefreshKey((n) => n + 1);
  }

  function handleRemixGame(game: CatalogEntry, initialRemixRequest?: string) {
    // The game still has to be mounted for Remix to swap and preview its document,
    // but the sheet opens on the first frame — no theater detour and second wrench.
    setStageContent({ type: 'catalog', game, initialRemixOpen: true, initialRemixRequest });
  }

  function handleExitCatalogTheater() {
    // Deep-linked `/play` → canonical page (replace). Else dismiss overlay only.
    if (route.view === 'play' && stageContent?.type === 'catalog') {
      const game = stageContent.game;
      navigate(gamePath(gamePageHandle(game), game.slug), { replace: true });
      setStageContent(null);
      return;
    }
    setStageContent(null);
  }

  function handleExitPartyTheater() {
    if (route.view === 'play' && stageContent?.type === 'party') {
      const game = stageContent.game;
      navigate(gamePath(gamePageHandle(game), game.slug), { replace: true });
      setStageContent(null);
      return;
    }
    setStageContent(null);
  }

  async function handlePlayTogether(game: CatalogEntry, via?: PlayVia) {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!game.multiplayer) return;

    setPartyError(null);
    try {
      const session = await createPartySession(game.slug, game.multiplayer.maxPlayers);
      setStageContent({ type: 'party', game, session, ...(via === undefined ? {} : { via }) });
      document.getElementById('stage')?.scrollIntoView?.({ behavior: 'smooth' });
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : t('errors.generic'));
    }
  }

  // Full-viewport theater / party overlay. Rendered from every branch that can open
  // it — including the open-chrome early returns for `/:handle` and `/:handle/:slug`.
  // Those routes set `stageContent` (and with it `body.player-open` scroll lock) the
  // same way home and `/play` do; if the overlay only lived in the signed-in main
  // return, Play/Remix on a game page would lock the page and show nothing.
  const stageOverlay = (
    <>
      {stageContent?.type === 'party' && (
        <section id="stage" className="panel stage is-playing-full-viewport">
          <div className="game-theater-bar">
            <div className="game-theater-meta">
              <span className="theater-badge">
                <PixelIcon name="phone" size={13} /> {t('party.badge')}
              </span>
              <h2 className="theater-title">{stageContent.game.title}</h2>
            </div>
            <div className="game-theater-actions">
              <button
                className="secondary-btn exit-btn"
                onClick={handleExitPartyTheater}
                aria-label={t('catalog.exitPlayer', { defaultValue: 'Close' })}
                title={t('catalog.exitPlayer', { defaultValue: 'Close' })}
              >
                <PixelIcon name="close" size={14} />
              </button>
            </div>
          </div>
          <div className="game-viewport-container">
            <PartyStage
              key={stageContent.session.code}
              game={stageContent.game}
              session={stageContent.session}
              via={stageContent.via}
              onExit={handleExitPartyTheater}
            />
          </div>
        </section>
      )}

      {stageContent?.type === 'catalog' && (
        <GameTheater
          key={stageContent.game.slug}
          title={stageContent.game.title}
          // AI Act art. 50 needs a disclosure at the point of consumption; keep
          // it short so the title stays the hero of the bar.
          badge={{ icon: 'sparkle', label: t('ai.generatedShort') }}
          source={{ slug: stageContent.game.slug }}
          onExit={handleExitCatalogTheater}
          orientation={stageContent.game.orientation}
          reportSlug={stageContent.game.slug}
          submittedBy={stageContent.game.submittedBy}
          creatorHandle={stageContent.game.creatorHandle}
          controls={stageContent.game.controls}
          touch={stageContent.game.touch}
          editor={stageContent.game.editor}
          via={stageContent.via}
          initialRemixOpen={stageContent.initialRemixOpen}
          initialRemixRequest={stageContent.initialRemixRequest}
        />
      )}

      {showBetaWelcome && user && <BetaWelcomeSplash onContinue={dismissBetaWelcome} />}
    </>
  );

  // A phone that scanned a lobby QR is anonymous by design: it has no session and
  // never will, so the controller route is checked BEFORE the auth gates. It is
  // useless without a valid room token, which only an allowlisted host can mint.
  if (route.view === 'join') {
    return <ControllerView code={route.code} token={route.token} />;
  }

  // Ahead of both the loading screen and the beta gate on purpose. The privacy policy
  // has to be readable by someone who has not signed in and is deciding whether to —
  // that decision is the moment of collection GDPR art. 13 is about, and the terms
  // are what they would be agreeing to. A legal page behind a login is not published.
  if (route.view === 'legal') {
    return (
      <div className="app app--legal">
        <NavHeader {...navHeader} />
        <main className="content">
          <LegalPage doc={route.doc} onBack={() => navigate('/')} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Open chrome: contact and /connect work without a session.
  if (route.view === 'contact' || route.view === 'connect') {
    return (
      <div className={route.view === 'contact' ? 'app app--contact' : 'app app--connect'}>
        <NavHeader {...navHeader} />
        <main className="content">
          {route.view === 'contact' ? (
            <ContactPage onBack={() => navigate('/')} />
          ) : (
            <ConnectAgentsPage onBack={() => navigate('/')} />
          )}
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Public creator profiles — same open-chrome posture as contact/legal.
  if (route.view === 'creator') {
    return (
      <div className="app app--creator">
        <NavHeader {...navHeader} />
        <main className="content">
          <CreatorProfilePage
            handle={route.handle}
            onBack={() => navigate('/')}
            onPlay={handlePlayGame}
            onNavigate={navigate}
            onProfileLoaded={(profile: PublicCreatorProfile) => {
              setCreatorName(profile.profileName);
              if (profile.handle !== route.handle) {
                navigate(creatorPath(profile.handle), { replace: true });
              }
            }}
          />
        </main>
        {/* Theater must mount here too: profile Play sets stageContent on this branch. */}
        {stageOverlay}
        {!stageContent && <SiteFooter />}
      </div>
    );
  }

  // Game pages require beta access; the play permalink is the promotional exception.
  if (route.view === 'game' && !authLoading && (!privateBeta || user)) {
    return (
      <div className="app app--game">
        <NavHeader {...navHeader} />
        <main className="content">
          <GamePage
            key={`${route.handle}/${route.slug}`}
            handle={route.handle}
            slug={route.slug}
            onNavigate={navigate}
            onPlay={handlePlayGame}
            onPlayTogether={handlePlayTogether}
            onRemix={handleRemixGame}
            onCanonicalPath={(path) => navigate(path, { replace: true })}
            onGameLoaded={setGameTitle}
          />
        </main>
        {/* Play/Remix on this page set stageContent; without the overlay here the
            body scroll-locks (`player-open`) and nothing covers the page. */}
        {stageOverlay}
        {partyError && <p className="error party-error">{partyError}</p>}
        {!stageContent && <SiteFooter />}
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      </div>
    );
  }

  // The proposer's tracker. Behind the ordinary chrome rather than the open-chrome
  // posture legal and contact take: this is signed-in territory, and the API answers 401
  // to anyone else, so there is nothing to show a visitor who is not.
  if (route.view === 'proposals') {
    return (
      <div className="app app--proposals">
        <NavHeader {...navHeader} />
        <main className="content">
          <ProposalsPage />
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Same early exit as legal: a typo'd URL should not bounce anonymous visitors into
  // the closed-beta splash (or the home catalog) and pretend the path was valid.
  if (route.view === 'notFound') {
    return (
      <div className="app app--not-found">
        <NavHeader {...navHeader} />
        <main className="content">
          <NotFoundPage onHome={() => navigate('/')} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  if (authLoading) {
    return <AppLoadingScreen />;
  }

  if (route.view === 'invite') {
    return user ? (
      <BetaInvitePage code={route.code} onContinue={() => navigate('/')} />
    ) : (
      <ClosedBetaSplash inviteCode={route.code} />
    );
  }

  // Closed beta: no session → branded splash (sign-in + waitlist). The shell still loads so
  // the Google button can appear; every data route is walled on the API side.
  if (publicPlayAllowed && route.view === 'play') {
    return <PublicPlayView slug={route.slug} onExit={exitOverlay} />;
  }

  if (privateBeta && !user) {
    return <ClosedBetaSplash />;
  }

  // /play cold visit: hold mascot until catalog answers.
  if (route.view === 'play' && catalogStatus === 'loading') {
    return <AppLoadingScreen onExit={exitOverlay} />;
  }

  // Unpublished /play: loading is a full-viewport overlay; error keeps chrome.
  if (unpublishedPlayTheater) {
    return (
      <div className="app app--unpublished-play">
        <NavHeader {...navHeader} />
        <main className="content">
          <UnpublishedPlayView slug={route.slug} onExit={exitOverlay} onTitle={setUnpublishedPlayTitle} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Bridge catalog-ready → auto-open so GameDetailPage does not flash first.
  // Close leaves `/play` for the canonical page, so no dismiss-ref is needed.
  if (route.view === 'play' && catalogStatus === 'ready' && playCatalogGame && !stageContent) {
    return <AppLoadingScreen onExit={exitOverlay} />;
  }

  return (
    <div className="app">
      <NavHeader
        {...navHeader}
        isOnCreate={route.view === 'create'}
        isOnParty={route.view === 'party'}
        isOnStudio={route.view === 'studio' || route.view === 'studioWelcome' || route.view === 'studioConnect'}
      />

      {/* Standalone PWA has no browser pull-to-refresh; this restores it on home only,
          and stays inert while a game covers the viewport (player-open). */}
      <PullToRefresh enabled={route.view === 'home' && !stageContent} onRefresh={handlePullToRefresh} />

      <main className="content">
        <RouteChunkBoundary
          fallback={
            <div className="content-load-error">
              <p>{t('app.surfaceLoadFailed')}</p>
              <button type="button" className="secondary-btn" onClick={() => window.location.reload()}>
                {t('app.reload')}
              </button>
            </div>
          }
        >
          <Suspense fallback={<p className="content-loading">{t('app.loadingSurface')}</p>}>
            {route.view === 'admin' ? (
              <AdminConsole section={route.section} onNavigate={navigate} />
            ) : route.view === 'review' ? (
              <ReviewDesk />
            ) : route.view === 'studioWelcome' ? (
              <StudioWelcomeView game={route.game} onOpenStudio={navigate} />
            ) : route.view === 'studioConnect' ? (
              <StudioConnectWizard game={route.game} onOpenStudio={navigate} />
            ) : route.view === 'studio' ? (
              <CreatorStudioView
                selectedGame={route.game}
                selectedTab={route.tab}
                selectedPosture={route.posture}
                onNavigate={navigate}
                onPlay={(slug) => navigate(playPath(slug))}
                onRetryConcept={(concept) => {
                  setRetryPrompt(concept);
                  setPendingScrollTarget('hero-prompt');
                }}
              />
            ) : (
              <>
                {route.view === 'play' ? (
                  !stageContent && (
                    <GameDetailPage
                      game={playCatalogGame}
                      state={catalogStatus}
                      onPlay={handlePlayGame}
                      onPlayTogether={handlePlayTogether}
                      onRemix={handleRemixGame}
                      onRetry={handleRetryCatalog}
                    />
                  )
                ) : route.view === 'create' ? (
                  <CreatePage
                    // Remount when a retry loads a new idea, so the prompt box picks it up.
                    retryKey={retryPrompt ?? 'blank'}
                    initialPrompt={resolveCreateInitialPrompt(partySeedRef.current, retryPrompt)}
                    catalogEntries={catalogEntries}
                    onPlayGame={handlePlayGame}
                    submissionStatus={submissionStatus}
                    submissionError={submissionError}
                    onSubmitSpec={(concept, referenceImages) =>
                      void handleSubmitSpec(concept, undefined, referenceImages)
                    }
                    onPlatformBuilderAvailability={setPlatformBuilderAvailability}
                  />
                ) : route.view === 'party' ? (
                  <PartyPage
                    catalogStatus={catalogStatus}
                    catalogError={catalogError}
                    catalogEntries={catalogEntries}
                    onPlayGame={handlePlayGame}
                    onPlayTogether={(game, via) => void handlePlayTogether(game, via)}
                    onRetryCatalog={handleRetryCatalog}
                    onCreateCustom={handlePartyCreateNav}
                    partyError={partyError}
                  />
                ) : (
                  <div id="hero-prompt">
                    <HeroPromptSection
                      // Remount when a retry loads a new idea, so the prompt box picks it up.
                      key={retryPrompt ?? 'blank'}
                      initialPrompt={retryPrompt ?? ''}
                      catalogEntries={catalogEntries}
                      onPlayGame={handlePlayGame}
                      submissionStatus={submissionStatus}
                      submissionError={submissionError}
                      onSubmitSpec={(concept, referenceImages) =>
                        void handleSubmitSpec(concept, undefined, referenceImages)
                      }
                      onPlatformBuilderAvailability={setPlatformBuilderAvailability}
                    />
                  </div>
                )}

                {/* Gated on the pending spec, same as before /create existed; portals itself. */}
                {route.view !== 'play' && pendingSpec && (
                  <CreatorQA
                    key={qaFormKey}
                    questions={qaQuestions}
                    initialConcept={pendingSpec.concept}
                    initialTitle={pendingSpec.title}
                    onSubmitWithConcept={handleQaComplete}
                    onTitleChange={handleQaTitleChange}
                    onCancel={handleQaCancel}
                    submitting={submissionStatus === 'loading' || submissionStatus === 'refining'}
                    error={submissionError}
                    initialAnswers={latestAnswersRef.current}
                    onAnswersChange={handleQaAnswersChange}
                    initialBuilder={qaBuilder}
                    onBuilderChange={handleQaBuilderChange}
                    platformUnavailable={
                      platformBuilderAvailability?.available === false ? platformBuilderAvailability.reason : undefined
                    }
                  />
                )}

                {stageOverlay}

                {partyError && route.view !== 'party' && <p className="error party-error">{partyError}</p>}

                {/* The gallery is home content; game pages have their own compact surface. */}
                {route.view === 'home' && (
                  <ArcadeCatalog
                    catalogStatus={catalogStatus}
                    catalogError={catalogError}
                    catalogEntries={catalogEntries}
                    onPlayGame={handlePlayGame}
                    onPlayTogether={(game, via) => void handlePlayTogether(game, via)}
                    onRetryCatalog={handleRetryCatalog}
                    recommendationsRefreshKey={recommendationsRefreshKey}
                    creatorGamesRefreshKey={myGamesRefreshKey}
                  />
                )}

                {/* Both pages' real content can run shorter than the viewport, leaving a
                bare gap above the sticky footer — fill it with a reason to scroll back up.
                Gated on the catalog on both: /create's showcase rail is catalog data too. */}
                {(route.view === 'home' || route.view === 'create') && catalogStatus === 'ready' && <BottomCta />}
              </>
            )}
          </Suspense>
        </RouteChunkBoundary>
      </main>

      {/* Hidden while a game is on stage: the player is a full-viewport fixed overlay,
          and a footer scrolling underneath it is chrome nobody can reach anyway. */}
      {!stageContent && <SiteFooter />}

      {/* Same reasoning, and then some: both of these are bottom-anchored bars, and a
          bar over a running game is worse than merely unreachable. Mounting them here —
          inside the signed-in app, past the join and splash early returns — is also what
          keeps the install nudge away from controller guests (mobile-app-plan.md in the private ops repo, open
          question 1) and from visitors who have not got in yet. */}
      {!stageContent && <InstallPrompt />}
      {!stageContent && <AppUpdateBanner />}

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
