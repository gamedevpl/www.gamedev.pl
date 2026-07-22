import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateGame, type GeneratedGame } from './api';
import { fetchCatalog, gameUrl, type CatalogEntry } from './catalog';
import { GameFrame } from './GameFrame';
import { LanguageSwitcher } from './LanguageSwitcher';
import githubIcon from './assets/github-mark-white.svg';
import logo from './logo-gamedev.png';

type StageContent =
  { type: 'catalog'; game: CatalogEntry } | { type: 'generated'; game: GeneratedGame; prompt: string };

export function App() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [stageContent, setStageContent] = useState<StageContent | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogEntries, setCatalogEntries] = useState<CatalogEntry[]>([]);

  const suggestions = [t('suggestions.dodge'), t('suggestions.collect'), t('suggestions.space')];

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

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="logo">
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
                  <button onClick={() => setStageContent({ type: 'catalog', game: entry })}>{t('catalog.play')}</button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel prompt-panel">
          <h2 className="section-title">{t('home.mockTitle')}</h2>
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
            <button onClick={() => handleGenerate(prompt)} disabled={status === 'loading' || !prompt.trim()}>
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
              >
                {suggestion}
              </button>
            ))}
          </div>
          {error && <p className="error">{error}</p>}
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
                {stageContent.game.description && <p className="game-description">{stageContent.game.description}</p>}
                {stageContent.prompt && (
                  <p className="game-source">{t('home.generatedFrom', { prompt: stageContent.prompt })}</p>
                )}
              </div>
              <GameFrame key={stageContent.game.html} title={stageContent.game.title} html={stageContent.game.html} />
            </>
          ) : (
            <div className="empty-stage">{status === 'loading' ? t('home.building') : t('home.emptyStage')}</div>
          )}
        </section>
      </main>
    </div>
  );
}
