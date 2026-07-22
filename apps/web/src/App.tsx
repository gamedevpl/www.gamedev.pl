import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateGame, type GeneratedGame } from './api';
import { fetchCatalog, gameUrl, type CatalogEntry } from './catalog';
import { GameFrame } from './GameFrame';
import { NavHeader } from './NavHeader';
import { HeroPromptSection } from './HeroPromptSection';
import { ArcadeCatalog } from './ArcadeCatalog';
import { CreatorStudio } from './CreatorStudio';
import { TransparencySection } from './TransparencySection';
import { SubmissionStatusView } from './SubmissionStatusView';
import { parseHashRoute, statusHash } from './router';
import { submitSpec } from './submissionApi';
import { getSavedSpecs, saveSpec, type SavedSpec } from './mySpecs';

type StageContent =
  { type: 'catalog'; game: CatalogEntry } | { type: 'generated'; game: GeneratedGame; prompt: string };

export function App() {
  const { t } = useTranslation();
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));

  // Catalog state
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);

  // Local storage saved specs
  const [savedSpecs, setSavedSpecs] = useState<SavedSpec[]>(() => getSavedSpecs());

  // Stage content
  const [stageContent, setStageContent] = useState<StageContent | null>(null);

  // Greenfield submission state
  const [submissionTitle, setSubmissionTitle] = useState('');
  const [submissionConcept, setSubmissionConcept] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading'>('idle');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [remixSourceTitle, setRemixSourceTitle] = useState<string | null>(null);

  // Demo generator state
  const [showDemoGenerator, setShowDemoGenerator] = useState(false);
  const [mockPrompt, setMockPrompt] = useState('');
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

  useEffect(() => {
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
  }, []);

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
    const trimmed = text.trim();
    if (!trimmed) return;
    setMockStatus('loading');
    setMockError(null);
    try {
      const generatedGame = await generateGame(trimmed);
      setStageContent({ type: 'generated', game: generatedGame, prompt: trimmed });
      setMockStatus('idle');
      // Scroll stage into view
      document.getElementById('stage')?.scrollIntoView?.({ behavior: 'smooth' });
    } catch (err) {
      setMockError(err instanceof Error ? err.message : t('errors.generic'));
      setMockStatus('error');
    }
  }

  async function handleSubmitSpec(title: string, concept: string, displayName: string = '') {
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

      setSubmissionTitle('');
      setSubmissionConcept('');
      setRemixSourceTitle(null);
      setSubmissionStatus('idle');

      window.location.hash = statusHash(response.token);
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : t('errors.generic'));
      setSubmissionStatus('idle');
    }
  }

  function handleRemixGame(game: CatalogEntry) {
    setSubmissionTitle(`Remix: ${game.title}`);
    setSubmissionConcept(
      `A custom remix of "${game.title}" (${game.genre}). Controls: ${game.controls}.\n\nDesired changes:\n- Add new game mechanics and visual effects.\n- Enhance speed and score multiplier system.`,
    );
    setRemixSourceTitle(game.title);
    window.location.hash = '#studio';
    document.getElementById('studio')?.scrollIntoView?.({ behavior: 'smooth' });
  }

  function handlePlayGame(game: CatalogEntry) {
    setStageContent({ type: 'catalog', game });
    document.getElementById('stage')?.scrollIntoView?.({ behavior: 'smooth' });
  }

  return (
    <div className="app">
      <NavHeader activeSpecsCount={savedSpecs.length} onNavigate={handleNavigateSection} />

      <main className="content">
        {route.view === 'status' ? (
          <SubmissionStatusView token={route.token} />
        ) : (
          <>
            <div id="hero-prompt">
              <HeroPromptSection
                submissionStatus={submissionStatus}
                submissionError={submissionError}
                onSubmitSpec={(title, concept) => void handleSubmitSpec(title, concept)}
                mockStatus={mockStatus}
                mockError={mockError}
                onGenerateMock={(prompt) => void handleGenerateMock(prompt)}
              />
            </div>

            <section id="stage" className="panel stage">
              {stageContent?.type === 'catalog' ? (
                <>
                  <div className="game-meta">
                    <h2>{stageContent.game.title}</h2>
                    <p>{stageContent.game.genre}</p>
                    <p className="game-description">
                      {t('catalog.controlsSummary', { controls: stageContent.game.controls })}
                    </p>
                  </div>
                  <GameFrame
                    key={stageContent.game.slug}
                    title={stageContent.game.title}
                    src={gameUrl(stageContent.game.slug)}
                  />
                </>
              ) : stageContent?.type === 'generated' ? (
                <>
                  <div className="game-meta">
                    <h2>{stageContent.game.title}</h2>
                    {stageContent.game.description && (
                      <p className="game-description">{stageContent.game.description}</p>
                    )}
                    {stageContent.prompt && (
                      <p className="game-source">{t('home.generatedFrom', { prompt: stageContent.prompt })}</p>
                    )}
                  </div>
                  <GameFrame
                    key={stageContent.game.html}
                    title={stageContent.game.title}
                    html={stageContent.game.html}
                  />
                </>
              ) : (
                <div className="empty-stage">{t('home.emptyStage')}</div>
              )}
            </section>

            <ArcadeCatalog
              catalogStatus={catalogStatus}
              catalogError={catalogError}
              catalogEntries={catalogEntries}
              onPlayGame={handlePlayGame}
              onRemixGame={handleRemixGame}
            />

            <CreatorStudio
              savedSpecs={savedSpecs}
              initialTitle={submissionTitle}
              initialConcept={submissionConcept}
              remixSourceTitle={remixSourceTitle}
              submissionStatus={submissionStatus}
              submissionError={submissionError}
              onSubmitSpec={(title, concept, displayName) => void handleSubmitSpec(title, concept, displayName)}
              onTrackToken={(token) => {
                window.location.hash = statusHash(token);
              }}
              showDemoGenerator={showDemoGenerator}
              onToggleDemoGenerator={() => setShowDemoGenerator((v) => !v)}
              mockPrompt={mockPrompt}
              onMockPromptChange={setMockPrompt}
              mockStatus={mockStatus}
              mockError={mockError}
              onGenerateMock={(prompt) => void handleGenerateMock(prompt)}
            />

            <TransparencySection />
          </>
        )}
      </main>
    </div>
  );
}
