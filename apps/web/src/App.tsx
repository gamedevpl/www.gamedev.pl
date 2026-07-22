import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateGame, type GeneratedGame } from './api';
import { fetchCatalog, gameUrl, type CatalogEntry } from './catalog';
import { GameFrame } from './GameFrame';
import { LanguageSwitcher } from './LanguageSwitcher';
import { SubmissionStatusView } from './SubmissionStatusView';
import { parseHashRoute, statusHash } from './router';
import { submitSpec } from './submissionApi';
import githubIcon from './assets/github-mark-white.svg';
import logo from './logo-gamedev.png';

type StageContent =
  { type: 'catalog'; game: CatalogEntry } | { type: 'generated'; game: GeneratedGame; prompt: string };

type SubmittedSpec = {
  token: string;
  title: string;
  trackingUrl: string;
};

export function App() {
  const { t } = useTranslation();
  const [route, setRoute] = useState(() => parseHashRoute(window.location.hash));
  const [submissionTitle, setSubmissionTitle] = useState('');
  const [submissionConcept, setSubmissionConcept] = useState('');
  const [submissionDisplayName, setSubmissionDisplayName] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'loading'>('idle');
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [lastSubmittedSpec, setLastSubmittedSpec] = useState<SubmittedSpec | null>(null);
  const [showDemoGenerator, setShowDemoGenerator] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [stageContent, setStageContent] = useState<StageContent | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);

  const suggestions = [t('suggestions.dodge'), t('suggestions.collect'), t('suggestions.space')];

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

  async function handleGenerate(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatus('loading');
    setError(null);
    setStageContent(null);
    try {
      const generatedGame = await generateGame(trimmed);
      setStageContent({ type: 'generated', game: generatedGame, prompt: trimmed });
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
      setStatus('error');
    }
  }

  async function handleSubmitSpec(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = submissionTitle.trim();
    const concept = submissionConcept.trim();
    const displayName = submissionDisplayName.trim();

    if (!title || !concept) return;

    setSubmissionStatus('loading');
    setSubmissionError(null);

    try {
      const response = await submitSpec({
        title,
        concept,
        displayName: displayName || undefined,
      });
      const trackingUrl = new URL(response.statusUrl, window.location.href).toString();

      setLastSubmittedSpec({ token: response.token, title, trackingUrl });
      setSubmissionTitle('');
      setSubmissionConcept('');
      setSubmissionDisplayName('');
      setSubmissionStatus('idle');
      window.location.hash = statusHash(response.token);
    } catch (err) {
      setSubmissionError(err instanceof Error ? err.message : t('errors.generic'));
      setSubmissionStatus('idle');
    }
  }

  const currentSubmittedSpec =
    route.view === 'status' ? (lastSubmittedSpec?.token === route.token ? lastSubmittedSpec : null) : null;

  return (
    <div className="app">
      <header className="app-header">
        <a href="#/" className="logo">
          <img src={logo} alt={t('header.logoAlt')} width="70" height="60" />
          gamedev<span className="turquoise">.pl</span>
        </a>
        <div className="header-actions">
          <LanguageSwitcher />
          <a className="github" href="https://github.com/gamedevpl/www.gamedev.pl" aria-label={t('header.githubAria')}>
            <img src={githubIcon} alt="" />
          </a>
        </div>
      </header>

      <main className="content">
        <h1 className="page-title">{t('home.title')}</h1>

        {route.view === 'status' ? (
          <SubmissionStatusView
            token={route.token}
            submittedTitle={currentSubmittedSpec?.title}
            trackingUrl={currentSubmittedSpec?.trackingUrl}
          />
        ) : (
          <>
            <section className="panel catalog-panel">
              <h2 className="section-title">{t('catalog.title')}</h2>
              {catalogStatus === 'loading' ? (
                <p className="catalog-state">{t('catalog.loading')}</p>
              ) : catalogStatus === 'error' ? (
                <p className="error">{t('catalog.error', { message: catalogError ?? t('errors.generic') })}</p>
              ) : catalogEntries.length === 0 ? (
                <p className="catalog-state">{t('catalog.empty')}</p>
              ) : (
                <div className="catalog-grid">
                  {catalogEntries.map((entry) => (
                    <article key={entry.slug} className="catalog-card">
                      <h3>{entry.title}</h3>
                      <dl className="catalog-meta">
                        <div>
                          <dt>{t('catalog.genre')}</dt>
                          <dd>{entry.genre}</dd>
                        </div>
                        <div>
                          <dt>{t('catalog.controls')}</dt>
                          <dd>{entry.controls}</dd>
                        </div>
                      </dl>
                      <button onClick={() => setStageContent({ type: 'catalog', game: entry })}>
                        {t('catalog.play')}
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="panel prompt-panel">
              <h2 className="section-title">{t('submit.title')}</h2>
              <p className="panel-copy">{t('submit.description')}</p>

              <form className="submission-form" onSubmit={handleSubmitSpec}>
                <label className="field">
                  <span>{t('submit.titleLabel')}</span>
                  <input
                    value={submissionTitle}
                    onChange={(event) => setSubmissionTitle(event.target.value)}
                    maxLength={80}
                    placeholder={t('submit.titlePlaceholder')}
                  />
                  <small className="field-hint">{t('submit.titleHint')}</small>
                </label>

                <label className="field">
                  <span>{t('submit.conceptLabel')}</span>
                  <textarea
                    value={submissionConcept}
                    onChange={(event) => setSubmissionConcept(event.target.value)}
                    placeholder={t('submit.conceptPlaceholder')}
                    rows={5}
                  />
                  <small className="field-hint">{t('submit.conceptHint')}</small>
                </label>

                <label className="field">
                  <span>{t('submit.displayNameLabel')}</span>
                  <input
                    value={submissionDisplayName}
                    onChange={(event) => setSubmissionDisplayName(event.target.value)}
                    maxLength={40}
                    placeholder={t('submit.displayNamePlaceholder')}
                  />
                  <small className="field-hint">{t('submit.displayNameHint')}</small>
                </label>

                <div className="prompt-actions">
                  <button
                    type="submit"
                    disabled={submissionStatus === 'loading' || !submissionTitle.trim() || !submissionConcept.trim()}
                  >
                    {submissionStatus === 'loading' ? t('submit.submitting') : t('submit.submit')}
                  </button>
                </div>
              </form>

              {submissionError && <p className="error">{submissionError}</p>}

              <button className="toggle-link" onClick={() => setShowDemoGenerator((value) => !value)} type="button">
                {showDemoGenerator ? t('submit.demoHide') : t('submit.demoToggle')}
              </button>

              {showDemoGenerator ? (
                <div className="demo-generator">
                  <h3 className="demo-title">{t('home.mockTitle')}</h3>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder={t('home.promptPlaceholder')}
                    rows={3}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(prompt);
                    }}
                  />
                  <div className="prompt-actions">
                    <button
                      onClick={() => handleGenerate(prompt)}
                      disabled={status === 'loading' || !prompt.trim()}
                      type="button"
                    >
                      {status === 'loading' ? t('home.building') : t('home.generate')}
                    </button>
                  </div>
                  <div className="suggestions">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        className="chip"
                        onClick={() => {
                          setPrompt(suggestion);
                          handleGenerate(suggestion);
                        }}
                        type="button"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                  {error && <p className="error">{error}</p>}
                </div>
              ) : null}
            </section>

            <section className="panel stage">
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
                <div className="empty-stage">{status === 'loading' ? t('home.building') : t('home.emptyStage')}</div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
