import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchRecentJobs, generateGameViaJob, type GeneratedGame, type JobState, type RecentJob } from './api';
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
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [recentError, setRecentError] = useState<string | null>(null);

  const suggestions = [t('suggestions.dodge'), t('suggestions.collect'), t('suggestions.space')];

  useEffect(() => {
    fetchRecentJobs()
      .then(setRecentJobs)
      .catch(() => setRecentError(t('recentGames.loadError')));
  }, [t]);

  async function handleGenerate(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatus('loading');
    setError(null);
    setGame(null);
    setJobState(null);
    setSubmittedPrompt(trimmed);
    try {
      const generated = await generateGameViaJob(trimmed, { onState: setJobState });
      setGame(generated);
      setStatus('idle');
      // Refresh the recent jobs list after a successful generation.
      fetchRecentJobs()
        .then(setRecentJobs)
        .catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
      setStatus('error');
    } finally {
      setJobState(null);
    }
  }

  async function handlePlayRecent(id: string) {
    setStatus('loading');
    setError(null);
    setGame(null);
    setJobState(null);
    setSubmittedPrompt('');
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      const job = (await response.json()) as { title?: string; description?: string; html?: string; state: string };
      if (job.state !== 'succeeded' || !job.html) throw new Error('game not available');
      setGame({ title: job.title ?? 'Game', description: job.description ?? '', html: job.html });
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
      setStatus('error');
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

        {(recentJobs.length > 0 || recentError) && (
          <section className="panel recent-games">
            <h2 className="recent-games-title">{t('recentGames.title')}</h2>
            {recentError ? (
              <p className="error">{recentError}</p>
            ) : recentJobs.length === 0 ? (
              <p className="recent-games-empty">{t('recentGames.empty')}</p>
            ) : (
              <ul className="recent-games-list">
                {recentJobs.map((job) => (
                  <li key={job.id} className="recent-games-item">
                    <span className="recent-games-item-title">{job.title ?? t(`jobState.${job.state}`)}</span>
                    <span className={`recent-games-item-state recent-games-item-state--${job.state}`}>
                      {t(`jobState.${job.state}`)}
                    </span>
                    {job.state === 'succeeded' && (
                      <button className="chip recent-games-play" onClick={() => handlePlayRecent(job.id)}>
                        {t('recentGames.play')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
