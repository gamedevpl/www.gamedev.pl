import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateGame, type GeneratedGame, type GenerateGameApiError } from './api.js';
import { fetchCatalog, type CatalogEntry } from './catalog.js';
import { GameTheater } from './GameTheater.js';
import { NavHeader } from './NavHeader.js';
import { HeroPromptSection } from './HeroPromptSection.js';
import { ArcadeCatalog } from './ArcadeCatalog.js';
import { CreatorStudioView } from './CreatorStudioView.js';
import { DraftView } from './DraftView.js';
import { GameHealthView } from './GameHealthView.js';
import { PixelIcon } from './PixelIcon.js';
import { CreatorQA, type QAQuestion } from './CreatorQA.js';
import {
  canonicalPlayPath,
  NAVIGATE_EVENT,
  parsePathRoute,
  statusPath,
  playPath,
  studioPath,
  type AppRoute,
} from './router.js';
import { LegalPage } from './LegalPage.js';
import { ContactPage } from './ContactPage.js';
import { NotFoundPage } from './NotFoundPage.js';
import { AppUpdateBanner } from './AppUpdateBanner.js';
import { InstallPrompt } from './InstallPrompt.js';
import { PullToRefresh } from './PullToRefresh.js';
import { SiteFooter } from './SiteFooter.js';
import { resolveDocumentTitle } from './pageTitle.js';
import { useDocumentTitle } from './useDocumentTitle.js';

/** Read the current URL into an AppRoute, rewriting `/ay|/ai/<slug>` → `/play/<slug>`. */
function readLocationRoute(): AppRoute {
  const canonical = canonicalPlayPath(window.location.pathname);
  if (canonical) {
    window.history.replaceState(null, '', canonical);
  }
  return parsePathRoute(window.location.pathname, window.location.hash);
}
import { submitSpec, refineSpec, type SubmissionApiError } from './submissionApi.js';
import { useActiveBuildCount } from './activeBuilds.js';
import { getSavedSpecs, saveSpec, type SavedSpec } from './mySpecs.js';
import { clearPendingQa, loadPendingQa, savePendingQa, type PendingQaAnswers } from './pendingQa.js';
import { useAuth } from './AuthContext.js';
import { AuthModal } from './AuthModal.js';
import { recordCreateStep } from './visitTelemetry.js';
import { ClosedBetaSplash } from './ClosedBetaSplash.js';
import { AppLoadingScreen } from './AppLoadingScreen.js';
import { ControllerView } from './mp/ControllerView.js';
import { PartyStage } from './mp/PartyStage.js';
import { createPartySession, type PartySession } from './mp/mpApi.js';

type StageContent =
  | { type: 'catalog'; game: CatalogEntry }
  | { type: 'generated'; game: GeneratedGame; prompt: string }
  | { type: 'party'; game: CatalogEntry; session: PartySession };

export function App() {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading, privateBeta } = useAuth();
  const [route, setRoute] = useState(() => readLocationRoute());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

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
  // Section to scroll to once the home route has rendered it (see handleNavigateSection).
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);
  // Idea loaded into the hero prompt by "try this again" on a failed/abandoned build.
  // A failed build usually needs an edit before it is worth another submission, so
  // this prefills rather than resubmitting.
  const [retryPrompt, setRetryPrompt] = useState<string | null>(null);

  // Stage content
  const [stageContent, setStageContent] = useState<StageContent | null>(null);
  // Builds actually in flight, from the server — the header badge's source of truth.
  // Paused while a game is on screen: the player covers the header, and a direct
  // /play/<slug> link is meant to cost the game and nothing else.
  const activeBuildCount = useActiveBuildCount(myGamesRefreshKey, !stageContent);

  // Greenfield submission state
  // 'refining' is the spec-refiner call that precedes a submission — a few seconds
  // during which nothing has been submitted yet, so the UI must not claim otherwise.
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'refining' | 'loading'>('idle');
  const [submissionError, setSubmissionError] = useState<string | null>(null);

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
  const qaRef = useRef<HTMLDivElement | null>(null);

  // Demo generator state
  const [mockStatus, setMockStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [mockError, setMockError] = useState<string | null>(null);

  // Multiplayer lobby state
  const [partyError, setPartyError] = useState<string | null>(null);
  // Draft's real name, reported by DraftView once the preview loads. Cleared on
  // unmount / slug change so the generic draft label returns while the next one loads.
  const [draftTitle, setDraftTitle] = useState<string | null>(null);

  // Tab title follows the route (and any known game/submission/draft name). App is
  // the single writer — children report names upward rather than touching document.title.
  const documentTitle = useMemo(() => {
    const stageTitle = stageContent ? stageContent.game.title : null;
    const playTitle =
      route.view === 'play'
        ? (catalogEntries.find((game) => game.slug === route.slug)?.title ??
          (stageContent?.type === 'catalog' && stageContent.game.slug === route.slug ? stageContent.game.title : null))
        : null;
    const studioTitle =
      route.view === 'studio' && route.token
        ? (savedSpecs.find((spec) => spec.token === route.token)?.title ?? null)
        : null;

    return resolveDocumentTitle(route, {
      copy: {
        home: t('pageTitle.home'),
        draft: t('pageTitle.draft'),
        join: t('pageTitle.join'),
        health: t('pageTitle.health'),
        studio: t('pageTitle.studio'),
        privacy: t('legal.privacy'),
        terms: t('legal.terms'),
        contact: t('pageTitle.contact'),
        notFound: t('pageTitle.notFound'),
        playNamed: t('pageTitle.playNamed'),
        draftNamed: t('pageTitle.draftNamed'),
        studioNamed: t('pageTitle.studioNamed'),
      },
      playTitle,
      studioTitle,
      draftTitle: route.view === 'draft' ? draftTitle : null,
      // Only surface ephemeral theaters while still on home — `/play/<slug>` already
      // carries its own title via playTitle, and leaving home must restore the home title.
      stageTitle: route.view === 'home' ? stageTitle : null,
    });
  }, [route, stageContent, catalogEntries, savedSpecs, draftTitle, t]);

  useDocumentTitle(documentTitle);

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

  // The URL is the source of truth for playing a *published* game: opening
  // `/play/<slug>` (via a click, a refresh, or a shared link) shows that game,
  // and navigating away from it closes the player. Generated/party stages are
  // ephemeral and are not represented in the route, so we only reconcile the
  // 'catalog' stage here and leave those untouched.
  useEffect(() => {
    if (route.view === 'play') {
      const entry = catalogEntries.find((game) => game.slug === route.slug);
      if (stageContent?.type === 'catalog' && stageContent.game.slug === route.slug) {
        if (entry && stageContent.game !== entry) {
          setStageContent({ type: 'catalog', game: entry });
        }
        return;
      }
      const initialGame: CatalogEntry = entry ?? {
        slug: route.slug,
        title: route.slug
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
        genre: '',
        controls: '',
        status: 'published',
        media: null,
        multiplayer: null,
        saves: null,
        world: null,
        // A deep link that beat the catalog: assume no preference rather than
        // nagging someone to rotate for a game whose spec we haven't read yet.
        // The effect above swaps in the real entry once the catalog lands.
        orientation: 'any',
        // Same reasoning: unknown, not "keyboard only". The badge is a warning, and
        // a deep link is no reason to show one.
        touch: null,
        submittedBy: null,
      };
      setStageContent({ type: 'catalog', game: initialGame });
      document.getElementById('stage')?.scrollIntoView?.({ behavior: 'smooth' });
    } else if (stageContent?.type === 'catalog') {
      // Route moved off this game (Exit, back button, home) — close the player.
      setStageContent(null);
    }
  }, [route, catalogEntries, stageContent]);

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
    // In private-beta mode /api/catalog requires a session — an anonymous fetch
    // would just 401. Don't fetch (and don't render an error) until signed in.
    // Outside private beta, catalog reads stay public (owner decision).
    if (privateBeta && !user) return;
    // Only the home page shows the gallery. On `/play/<slug>` the theater covers the
    // whole viewport, so fetching the catalog (and, through it, every entry's media)
    // is work nobody can see — a direct game link should cost the game, and nothing
    // else. Leaving the route loads it, which is the first moment it's visible.
    if (route.view !== 'home') return;

    let cancelled = false;
    // Soft refreshes (Retry, pull-to-refresh) keep the last-good grid on screen —
    // flipping to `loading` would blank the arcade for every pull. First load and
    // recovering from an error still show the busy mascot.
    setCatalogStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));

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
        // should not erase a catalog the visitor was already browsing.
        setCatalogEntries((prev) => (prev.length > 0 ? prev : []));
        setCatalogError(err instanceof Error ? err.message : null);
        setCatalogStatus((prev) => (prev === 'ready' ? 'ready' : 'error'));
      });

    return () => {
      cancelled = true;
    };
  }, [user, privateBeta, authLoading, route.view, catalogReloadKey]);

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

  // Bring the clarifying-questions panel into view when the refiner returns some.
  useEffect(() => {
    if (qaQuestions.length > 0) {
      qaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [qaQuestions]);

  // Menu navigation is scroll-to-section, but the sections only exist on the home
  // route — from a status page we have to go home first and scroll once the target
  // has mounted (the Games gallery may still be loading).
  const handleNavigateSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView?.({ behavior: 'smooth' });
      return;
    }
    setPendingScrollTarget(sectionId);
    navigate('/');
  };

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

  async function handleGenerateMock(text: string) {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;
    setMockStatus('loading');
    setMockError(null);
    try {
      const generatedGame = await generateGame(trimmed);
      setStageContent({ type: 'generated', game: generatedGame, prompt: trimmed });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('errors.generic');
      const category = err instanceof Error ? (err as GenerateGameApiError).category : undefined;
      if (message === 'content_rejected') {
        setMockError(t(`errors.contentRejected.${category ?? 'other'}`));
      } else if (message.includes('quota')) {
        setMockError(t('auth.quotaExceeded'));
      } else if (message.includes('blocked')) {
        setMockError(t('auth.accountBlocked'));
      } else {
        setMockError(message);
      }
      setMockStatus('error');
    } finally {
      setMockStatus('idle');
    }
  }

  // The generation gate: before spending a submission we run the spec refiner. If it
  // returns clarifying questions, generation pauses on the QA panel until they're
  // answered; a clean spec (or a refiner error — fail-open) submits straight through.
  async function handleSubmitSpec(title: string, concept: string, displayName: string = '') {
    if (!user) {
      // The wall between "wrote an idea" and "made an account". Everything before this
      // is anonymous, so this is the only place that drop-off is visible at all.
      recordCreateStep('signin_required');
      setIsAuthModalOpen(true);
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedConcept = concept.trim();
    if (!trimmedTitle || !trimmedConcept) return;

    setSubmissionStatus('refining');
    setSubmissionError(null);

    try {
      const { questions } = await refineSpec({
        title: trimmedTitle,
        concept: trimmedConcept,
        locale: i18n.language,
      });
      if (questions.length > 0) {
        recordCreateStep('qa_shown');
        const spec = { title: trimmedTitle, concept: trimmedConcept, displayName: displayName.trim() };
        setPendingSpec(spec);
        setQaQuestions(questions);
        savePendingQa({ spec, questions, answers: { selected: {}, custom: {} } });
        setSubmissionStatus('idle');
        return;
      }
    } catch {
      // Fail-open: a refiner outage must never block creation — submit as-is.
    }

    await submitRefinedSpec(trimmedTitle, trimmedConcept, displayName.trim());
  }

  // Actually creates the submission (after the QA gate) and jumps to its status page.
  async function submitRefinedSpec(title: string, concept: string, displayName: string) {
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
      });

      // Save to localStorage
      const updatedSpecs = saveSpec({
        token: response.token,
        title,
        concept,
        createdAt: Date.now(),
      });
      setSavedSpecs(updatedSpecs);
      setMyGamesRefreshKey((key) => key + 1);

      setSubmissionStatus('idle');
      recordCreateStep('submission_created');

      // Only now is the QA panel done: it stayed up, in its submitting state, for the
      // whole call. A no-op when the spec never went through the gate.
      setQaQuestions([]);
      setPendingSpec(null);
      clearPendingQa();

      navigate(statusPath(response.token));
    } catch (err) {
      const message = err instanceof Error ? err.message : t('errors.generic');
      const category = err instanceof Error ? (err as SubmissionApiError).category : undefined;
      if (message === 'content_rejected') {
        setSubmissionError(t(`errors.contentRejected.${category ?? 'other'}`));
      } else if (message === 'creation_paused') {
        setSubmissionError(t('errors.creationPaused'));
        // Site-wide limits, not this creator's — checked before the quota branch below
        // because saying "you've used your allowance" here would be untrue, and the
        // creator can see their remaining count on the hero to check it.
      } else if (message === 'creation_over_capacity') {
        setSubmissionError(t('errors.creationOverCapacity'));
      } else if (message.includes('quota')) {
        setSubmissionError(t('auth.quotaExceeded'));
      } else if (message.includes('blocked')) {
        setSubmissionError(t('auth.accountBlocked'));
      } else {
        setSubmissionError(message);
      }
      setSubmissionStatus('idle');
    }
  }

  // The panel stays mounted until the submission actually lands. Clearing it first
  // dropped the creator into blank space for however long the API took to create the
  // issue — they had just clicked a button and the page answered by deleting itself.
  // On failure it stays up with the error, so the answers survive a retry.
  const handleQaComplete = async (finalConcept: string) => {
    const spec = pendingSpec;
    if (!spec) return;
    await submitRefinedSpec(spec.title, finalConcept, spec.displayName);
  };

  const handleQaCancel = () => {
    setQaQuestions([]);
    setPendingSpec(null);
    clearPendingQa();
  };

  // Every keystroke and chip lands in storage, so the round survives a reload at any
  // point rather than only between questions.
  const handleQaAnswersChange = useCallback(
    (answers: PendingQaAnswers) => {
      if (!pendingSpec) return;
      savePendingQa({ spec: pendingSpec, questions: qaQuestions, answers });
    },
    [pendingSpec, qaQuestions],
  );

  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
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

  function handlePlayGame(game: CatalogEntry) {
    // Published games are permalinked: drive play through the URL so a refresh or
    // a shared link reopens the same game. The route→stage effect opens the stage.
    navigate(playPath(game.slug));
    // Soft refresh so "continue" / genre picks update after the next home visit.
    setRecommendationsRefreshKey((n) => n + 1);
  }

  async function handlePlayTogether(game: CatalogEntry) {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!game.multiplayer) return;

    setPartyError(null);
    try {
      const session = await createPartySession(game.slug, game.multiplayer.maxPlayers);
      setStageContent({ type: 'party', game, session });
      document.getElementById('stage')?.scrollIntoView?.({ behavior: 'smooth' });
    } catch (error) {
      setPartyError(error instanceof Error ? error.message : t('errors.generic'));
    }
  }

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
        <NavHeader
          activeBuildCount={activeBuildCount}
          onNavigate={handleNavigateSection}
          onHome={() => navigate('/')}
          onStudio={() => navigate(studioPath())}
        />
        <main className="content">
          <LegalPage doc={route.doc} onBack={() => navigate('/')} />
        </main>
        <SiteFooter />
      </div>
    );
  }

  // Same early exit as legal: the published contact point must work without a session.
  if (route.view === 'contact') {
    return (
      <div className="app app--contact">
        <NavHeader
          activeBuildCount={activeBuildCount}
          onNavigate={handleNavigateSection}
          onHome={() => navigate('/')}
          onStudio={() => navigate(studioPath())}
        />
        <main className="content">
          <ContactPage onBack={() => navigate('/')} />
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
        <NavHeader
          activeBuildCount={activeBuildCount}
          onNavigate={handleNavigateSection}
          onHome={() => navigate('/')}
          onStudio={() => navigate(studioPath())}
        />
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

  // Closed beta: no session → branded splash (sign-in + waitlist). The shell still loads so
  // the Google button can appear; every data route is walled on the API side.
  if (privateBeta && !user) {
    return <ClosedBetaSplash />;
  }

  return (
    <div className="app">
      <NavHeader
        activeBuildCount={activeBuildCount}
        onNavigate={handleNavigateSection}
        onHome={() => navigate('/')}
        onStudio={() => navigate(studioPath())}
      />

      {/* Standalone PWA has no browser pull-to-refresh; this restores it on home only,
          and stays inert while a game covers the viewport (player-open). */}
      <PullToRefresh enabled={route.view === 'home' && !stageContent} onRefresh={handlePullToRefresh} />

      <main className="content">
        {route.view === 'health' ? (
          <GameHealthView />
        ) : route.view === 'studio' ? (
          <CreatorStudioView
            selectedToken={route.token}
            selectedTab={route.tab}
            onNavigate={navigate}
            onPlay={(slug) => navigate(playPath(slug))}
            onRetryConcept={(concept) => {
              setRetryPrompt(concept);
              setPendingScrollTarget('hero-prompt');
            }}
          />
        ) : route.view === 'draft' ? (
          <DraftView slug={route.slug} onExit={() => navigate('/')} onDraftTitle={setDraftTitle} />
        ) : (
          <>
            <div id="hero-prompt">
              <HeroPromptSection
                // Remount when a retry loads a new idea, so the prompt box picks it up.
                key={retryPrompt ?? 'blank'}
                initialPrompt={retryPrompt ?? ''}
                catalogEntries={catalogEntries}
                onPlayGame={handlePlayGame}
                submissionStatus={submissionStatus}
                submissionError={submissionError}
                onSubmitSpec={(title, concept) => void handleSubmitSpec(title, concept)}
                mockStatus={mockStatus}
                mockError={mockError}
                onGenerateMock={(prompt) => void handleGenerateMock(prompt)}
              />
            </div>

            {qaQuestions.length > 0 && pendingSpec && (
              <div ref={qaRef}>
                <CreatorQA
                  questions={qaQuestions}
                  initialConcept={pendingSpec.concept}
                  onSubmitWithConcept={handleQaComplete}
                  onCancel={handleQaCancel}
                  submitting={submissionStatus === 'loading'}
                  error={submissionError}
                  initialAnswers={restoredQa.current?.answers}
                  onAnswersChange={handleQaAnswersChange}
                />
              </div>
            )}

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
                      onClick={() => setStageContent(null)}
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
                    onExit={() => setStageContent(null)}
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
                onExit={() => navigate('/')}
                orientation={stageContent.game.orientation}
                reportSlug={stageContent.game.slug}
                submittedBy={stageContent.game.submittedBy}
              />
            )}

            {stageContent?.type === 'generated' && (
              <GameTheater
                key={stageContent.game.html}
                title={stageContent.game.title}
                badge={{ icon: 'rocket', label: t('ai.generatedShort') }}
                source={{ html: stageContent.game.html }}
                onExit={() => setStageContent(null)}
                meta={
                  stageContent.prompt ? (
                    <span className="theater-controls">{t('home.generatedFrom', { prompt: stageContent.prompt })}</span>
                  ) : undefined
                }
              />
            )}

            {partyError && <p className="error party-error">{partyError}</p>}

            {/* Same reasoning as the catalog fetch: skip while /play covers the viewport. */}
            {route.view !== 'play' && (
              <ArcadeCatalog
                catalogStatus={catalogStatus}
                catalogError={catalogError}
                catalogEntries={catalogEntries}
                onPlayGame={handlePlayGame}
                onPlayTogether={(game) => void handlePlayTogether(game)}
                onRetryCatalog={handleRetryCatalog}
                recommendationsRefreshKey={recommendationsRefreshKey}
                creatorGamesRefreshKey={myGamesRefreshKey}
                onOpenStatus={(token) => navigate(statusPath(token))}
                onOpenStudio={() => navigate(studioPath())}
              />
            )}
          </>
        )}
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
