import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateGame, type GeneratedGame, type GenerateGameApiError } from './api';
import { fetchCatalog, type CatalogEntry } from './catalog';
import { GameTheater } from './GameTheater';
import { NavHeader } from './NavHeader';
import { HeroPromptSection } from './HeroPromptSection';
import { ArcadeCatalog } from './ArcadeCatalog';
import { MyGamesRail } from './MyGamesRail';
import { DraftView } from './DraftView';
import { GameHealthView } from './GameHealthView';
import { PixelIcon } from './PixelIcon';
import { SubmissionStatusView } from './SubmissionStatusView';
import { CreatorQA, type QAQuestion } from './CreatorQA';
import { canonicalPlayPath, parsePathRoute, statusPath, playPath, type AppRoute } from './router';

/** Read the current URL into an AppRoute, rewriting `/ay|/ai/<slug>` → `/play/<slug>`. */
function readLocationRoute(): AppRoute {
  const canonical = canonicalPlayPath(window.location.pathname);
  if (canonical) {
    window.history.replaceState(null, '', canonical);
  }
  return parsePathRoute(window.location.pathname, window.location.hash);
}
import { submitSpec, refineSpec, type SubmissionApiError } from './submissionApi';
import { getSavedSpecs, saveSpec, type SavedSpec } from './mySpecs';
import { clearPendingQa, loadPendingQa, savePendingQa, type PendingQaAnswers } from './pendingQa';
import { useAuth } from './AuthContext';
import { AuthModal } from './AuthModal';
import { ClosedBetaSplash } from './ClosedBetaSplash';
import { AppLoadingScreen } from './AppLoadingScreen';
import { ControllerView } from './mp/ControllerView';
import { PartyStage } from './mp/PartyStage';
import { createPartySession, type PartySession } from './mp/mpApi';

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

  // Local storage saved specs
  const [savedSpecs, setSavedSpecs] = useState<SavedSpec[]>(() => getSavedSpecs());
  // Bumped after a new submission so the my-games rail picks it up immediately.
  const [myGamesRefreshKey, setMyGamesRefreshKey] = useState(0);
  // Section to scroll to once the home route has rendered it (see handleNavigateSection).
  const [pendingScrollTarget, setPendingScrollTarget] = useState<string | null>(null);
  // Idea loaded into the hero prompt by "try this again" on a failed/abandoned build.
  // A failed build usually needs an edit before it is worth another submission, so
  // this prefills rather than resubmitting.
  const [retryPrompt, setRetryPrompt] = useState<string | null>(null);

  // Stage content
  const [stageContent, setStageContent] = useState<StageContent | null>(null);

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
        // A deep link that beat the catalog: assume no preference rather than
        // nagging someone to rotate for a game whose spec we haven't read yet.
        // The effect above swaps in the real entry once the catalog lands.
        orientation: 'any',
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

    void fetchCatalog()
      .then((entries) => {
        if (cancelled) return;
        setCatalogEntries(entries);
        setCatalogError(null);
        setCatalogStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCatalogEntries([]);
        setCatalogError(err instanceof Error ? err.message : null);
        setCatalogStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [user, privateBeta, route.view]);

  // Bring the clarifying-questions panel into view when the refiner returns some.
  useEffect(() => {
    if (qaQuestions.length > 0) {
      qaRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    }
  }, [qaQuestions]);

  // Menu navigation is scroll-to-section, but the sections only exist on the home
  // route — from a status page we have to go home first and scroll once the target
  // has mounted (the my-games rail also has to finish loading before it exists).
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

  function navigate(path: string) {
    // Update the URL (the source of truth) and the route synchronously so
    // navigation is immediate (and testable) without waiting for popstate.
    window.history.pushState(null, '', path);
    setRoute(readLocationRoute());
  }

  function handlePlayGame(game: CatalogEntry) {
    // Published games are permalinked: drive play through the URL so a refresh or
    // a shared link reopens the same game. The route→stage effect opens the stage.
    navigate(playPath(game.slug));
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

  if (authLoading) {
    return <AppLoadingScreen />;
  }

  if (privateBeta && !user) {
    return <ClosedBetaSplash />;
  }

  return (
    <div className="app">
      <NavHeader activeSpecsCount={savedSpecs.length} onNavigate={handleNavigateSection} onHome={() => navigate('/')} />

      <main className="content">
        {route.view === 'health' ? (
          <GameHealthView />
        ) : route.view === 'draft' ? (
          <DraftView slug={route.slug} onExit={() => navigate('/')} />
        ) : route.view === 'status' ? (
          <SubmissionStatusView
            token={route.token}
            submittedTitle={savedSpecs.find((spec) => spec.token === route.token)?.title}
            submittedConcept={savedSpecs.find((spec) => spec.token === route.token)?.concept}
            submittedAt={savedSpecs.find((spec) => spec.token === route.token)?.createdAt}
            onRetry={(concept) => {
              setRetryPrompt(concept);
              setPendingScrollTarget('hero-prompt');
              navigate('/');
            }}
          />
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

            {/* Same reasoning as the catalog above: the rail polls its own submissions
                every 30s, which is pure waste while the player covers it. */}
            {route.view !== 'play' && (
              <MyGamesRail
                refreshKey={myGamesRefreshKey}
                onOpenStatus={(token) => navigate(statusPath(token))}
                onPlayPublished={(slug) => navigate(playPath(slug))}
              />
            )}

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
                    <button className="secondary-btn exit-btn" onClick={() => setStageContent(null)}>
                      <PixelIcon name="close" size={12} /> {t('catalog.exitPlayer', { defaultValue: 'Exit Player' })}
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
                badge={{ icon: 'gamepad', label: t('catalog.playingBadge', { defaultValue: 'Playing' }) }}
                source={{ slug: stageContent.game.slug }}
                onExit={() => navigate('/')}
                orientation={stageContent.game.orientation}
              />
            )}

            {stageContent?.type === 'generated' && (
              <GameTheater
                key={stageContent.game.html}
                title={stageContent.game.title}
                badge={{ icon: 'rocket', label: 'AI Generated Game' }}
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

            <ArcadeCatalog
              catalogStatus={catalogStatus}
              catalogError={catalogError}
              catalogEntries={catalogEntries}
              onPlayGame={handlePlayGame}
              onPlayTogether={(game) => void handlePlayTogether(game)}
            />
          </>
        )}
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
