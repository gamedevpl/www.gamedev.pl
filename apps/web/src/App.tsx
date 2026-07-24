import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateGame, type GeneratedGame, type GenerateGameApiError } from './api';
import { fetchCatalog, type CatalogEntry } from './catalog';
import { GameTheater } from './GameTheater';
import { NavHeader } from './NavHeader';
import { HeroPromptSection } from './HeroPromptSection';
import { ArcadeCatalog } from './ArcadeCatalog';
import { PixelIcon } from './PixelIcon';
import { SubmissionStatusView } from './SubmissionStatusView';
import { CreatorQA, type QAQuestion } from './CreatorQA';
import { parseHashRoute, statusHash, playHash } from './router';
import { submitSpec, refineSpec, type SubmissionApiError } from './submissionApi';
import { getSavedSpecs, saveSpec, type SavedSpec } from './mySpecs';
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
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Catalog state
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);

  // Local storage saved specs
  const [savedSpecs, setSavedSpecs] = useState<SavedSpec[]>(() => getSavedSpecs());

  // Stage content
  const [stageContent, setStageContent] = useState<StageContent | null>(null);

  // Greenfield submission state
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading'>('idle');
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Clarifying-questions gate: a submission runs the spec refiner first, and when
  // it returns questions the creator must answer them before generation proceeds.
  // pendingSpec holds the spec awaiting those answers.
  const [qaQuestions, setQaQuestions] = useState<QAQuestion[]>([]);
  const [pendingSpec, setPendingSpec] = useState<{ title: string; concept: string; displayName: string } | null>(null);
  const qaRef = useRef<HTMLDivElement | null>(null);

  // Demo generator state
  const [mockStatus, setMockStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [mockError, setMockError] = useState<string | null>(null);

  // Multiplayer lobby state
  const [partyError, setPartyError] = useState<string | null>(null);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHashRoute(window.location.hash));
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
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
  // `#/play/<slug>` (via a click, a refresh, or a shared link) shows that game,
  // and navigating away from it closes the player. Generated/party stages are
  // ephemeral and are not represented in the route, so we only reconcile the
  // 'catalog' stage here and leave those untouched.
  useEffect(() => {
    if (route.view === 'play') {
      if (stageContent?.type === 'catalog' && stageContent.game.slug === route.slug) return;
      const entry = catalogEntries.find((game) => game.slug === route.slug);
      // Wait for the catalog to load if it hasn't yet — this effect re-runs when
      // catalogEntries arrives and opens the game then.
      if (!entry) return;
      setStageContent({ type: 'catalog', game: entry });
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
    if (route.view !== 'home' && route.view !== 'play') return;

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

  const handleNavigateSection = (sectionId: string) => {
    if (sectionId === 'studio-active') {
      window.location.hash = '#studio';
      return;
    }
    const element = document.getElementById(sectionId);
    if (element) {
      element?.scrollIntoView?.({ behavior: 'smooth' });
    } else if (route.view === 'status') {
      window.location.hash = '#/';
    }
  };

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

    setSubmissionStatus('loading');
    setSubmissionError(null);

    try {
      const { questions } = await refineSpec({
        title: trimmedTitle,
        concept: trimmedConcept,
        locale: i18n.language,
      });
      if (questions.length > 0) {
        setPendingSpec({ title: trimmedTitle, concept: trimmedConcept, displayName: displayName.trim() });
        setQaQuestions(questions);
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
      });

      // Save to localStorage
      const updatedSpecs = saveSpec({
        token: response.token,
        title,
        concept,
        createdAt: Date.now(),
      });
      setSavedSpecs(updatedSpecs);

      setSubmissionStatus('idle');

      window.location.hash = statusHash(response.token);
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

  const handleQaComplete = (finalConcept: string) => {
    const spec = pendingSpec;
    setQaQuestions([]);
    setPendingSpec(null);
    if (spec) void submitRefinedSpec(spec.title, finalConcept, spec.displayName);
  };

  const handleQaCancel = () => {
    setQaQuestions([]);
    setPendingSpec(null);
  };

  function navigateHash(hash: string) {
    // Update the URL (the source of truth) and the route synchronously. The
    // browser's hashchange event fires asynchronously and re-sets the same route,
    // so this stays consistent while making navigation immediate (and testable).
    window.location.hash = hash;
    setRoute(parseHashRoute(hash));
  }

  function handlePlayGame(game: CatalogEntry) {
    // Published games are permalinked: drive play through the URL so a refresh or
    // a shared link reopens the same game. The route→stage effect opens the stage.
    navigateHash(playHash(game.slug));
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
      <NavHeader activeSpecsCount={savedSpecs.length} onNavigate={handleNavigateSection} />

      <main className="content">
        {route.view === 'status' ? (
          <SubmissionStatusView
            token={route.token}
            submittedTitle={savedSpecs.find((spec) => spec.token === route.token)?.title}
            submittedConcept={savedSpecs.find((spec) => spec.token === route.token)?.concept}
            submittedAt={savedSpecs.find((spec) => spec.token === route.token)?.createdAt}
          />
        ) : (
          <>
            <div id="hero-prompt">
              <HeroPromptSection
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
                onExit={() => navigateHash('#/')}
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
