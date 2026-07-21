import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateGameViaJob, type GeneratedGame, type JobState } from './api';
import { GameFrame } from './GameFrame';
import { LanguageSwitcher } from './LanguageSwitcher';
import githubIcon from './assets/github-mark-white.svg';
import logo from './logo-gamedev.png';

export function App() {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [game, setGame] = useState<GeneratedGame | null>(null);
  const [submittedPrompt, setSubmittedPrompt] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const suggestions = [t('suggestions.dodge'), t('suggestions.collect'), t('suggestions.space')];

  async function handleGenerate(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatus('loading');
    setError(null);
    setGame(null);
    setJobState(null);
    setSubmittedPrompt(trimmed);
    try {
      setGame(await generateGameViaJob(trimmed, { onState: setJobState }));
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
      setStatus('error');
    } finally {
      setJobState(null);
    }
  }

  // Generation is queued, so tell the user which part of the wait they're in.
  const busyLabel = t(`jobState.${jobState ?? 'running'}`);

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

        <section className="panel prompt-panel">
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
            {status === 'loading' && <span className="job-state">{busyLabel}</span>}
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
          {game ? (
            <>
              <div className="game-meta">
                <h2>{game.title}</h2>
                {submittedPrompt && <p>{t('home.generatedFrom', { prompt: submittedPrompt })}</p>}
              </div>
              <GameFrame key={game.html} title={game.title} html={game.html} />
            </>
          ) : (
            <div className="empty-stage">{status === 'loading' ? busyLabel : t('home.emptyStage')}</div>
          )}
        </section>
      </main>
    </div>
  );
}
