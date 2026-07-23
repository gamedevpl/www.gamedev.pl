import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateGame, type GeneratedGame, type GenerateGameApiError } from './api';
import { fetchCatalog, type CatalogEntry } from './catalog';
import { GameFrame } from './GameFrame';
import { PublishedGameFrame } from './PublishedGameFrame';
import { NavHeader } from './NavHeader';
import { HeroPromptSection } from './HeroPromptSection';
import { ArcadeCatalog } from './ArcadeCatalog';
import { SubmissionStatusView } from './SubmissionStatusView';
import { parseHashRoute, statusHash } from './router';
import { submitSpec, type SubmissionApiError } from './submissionApi';
import { getSavedSpecs, saveSpec, type SavedSpec } from './mySpecs';
import { useAuth } from './AuthContext';
import { AuthModal } from './AuthModal';
import { ClosedBetaSplash } from './ClosedBetaSplash';
import { AppLoadingScreen } from './AppLoadingScreen';

type StageContent =
  { type: 'catalog'; game: CatalogEntry } | { type: 'generated'; game: GeneratedGame; prompt: string };

export function App() {
  const { t } = useTranslation();
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

  // Demo generator state
  const [mockStatus, setMockStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [mockError, setMockError] = useState<string | null>(null);

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

  useEffect(() => {
    // In private-beta mode /api/catalog requires a session — an anonymous fetch
    // would just 401. Don't fetch (and don't render an error) until signed in.
    // Outside private beta, catalog reads stay public (owner decision).
    if (privateBeta && !user) return;

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
  }, [user, privateBeta]);

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
      const response = await submitSpec({
        title: trimmedTitle,
        concept: trimmedConcept,
        displayName: displayName.trim() || undefined,
      });

      // Save to localStorage
      const updatedSpecs = saveSpec({
        token: response.token,
        title: trimmedTitle,
        concept: trimmedConcept,
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

  function handleRemixGame(game: CatalogEntry) {
    const remixPrompt = `Remix of "${game.title}" (${game.genre}): add higher difficulty, new powerups, and neon visual effects!`;
    void handleGenerateMock(remixPrompt);
    document.getElementById('stage')?.scrollIntoView?.({ behavior: 'smooth' });
  }

  function handlePlayGame(game: CatalogEntry) {
    setStageContent({ type: 'catalog', game });
    document.getElementById('stage')?.scrollIntoView?.({ behavior: 'smooth' });
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

            {stageContent && (
              <section id="stage" className="panel stage is-playing-full-viewport">
                {stageContent.type === 'catalog' ? (
                  <>
                    <div className="game-theater-bar">
                      <div className="game-theater-meta">
                        <span className="theater-badge">🎮 Playing</span>
                        <h2 className="theater-title">{stageContent.game.title}</h2>
                        <span className="theater-controls">
                          {t('catalog.controlsSummary', { controls: stageContent.game.controls })}
                        </span>
                      </div>
                      <div className="game-theater-actions">
                        <button className="secondary-btn remix-btn" onClick={() => handleRemixGame(stageContent.game)}>
                          ⚡ {t('catalog.remix')}
                        </button>
                        <button className="secondary-btn exit-btn" onClick={() => setStageContent(null)}>
                          ✕ {t('catalog.exitPlayer', { defaultValue: 'Exit Player' })}
                        </button>
                      </div>
                    </div>
                    <div className="game-viewport-container">
                      <PublishedGameFrame
                        key={stageContent.game.slug}
                        slug={stageContent.game.slug}
                        title={stageContent.game.title}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="game-theater-bar">
                      <div className="game-theater-meta">
                        <span className="theater-badge">🚀 AI Generated Game</span>
                        <h2 className="theater-title">{stageContent.game.title}</h2>
                        {stageContent.prompt && (
                          <span className="theater-controls">
                            {t('home.generatedFrom', { prompt: stageContent.prompt })}
                          </span>
                        )}
                      </div>
                      <div className="game-theater-actions">
                        <button className="secondary-btn exit-btn" onClick={() => setStageContent(null)}>
                          ✕ {t('catalog.exitPlayer', { defaultValue: 'Exit Player' })}
                        </button>
                      </div>
                    </div>
                    <div className="game-viewport-container">
                      <GameFrame
                        key={stageContent.game.html}
                        title={stageContent.game.title}
                        html={stageContent.game.html}
                      />
                    </div>
                  </>
                )}
              </section>
            )}

            <ArcadeCatalog
              catalogStatus={catalogStatus}
              catalogError={catalogError}
              catalogEntries={catalogEntries}
              onPlayGame={handlePlayGame}
              onRemixGame={handleRemixGame}
            />
          </>
        )}
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
}
