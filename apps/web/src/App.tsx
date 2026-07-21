import { useState } from 'react';
import { generateGameViaJob, type GeneratedGame, type JobState } from './api';
import { GameFrame } from './GameFrame';
import githubIcon from './assets/github-mark-white.svg';
import logo from './logo-gamedev.png';

const SUGGESTIONS = [
  'Dodge the falling rocks',
  'Collect the coins before time runs out',
  'Fly a rocket ship through asteroids',
];

// Generation is queued, so tell the user which part of the wait they're in.
const STATE_LABELS: Record<JobState, string> = {
  queued: 'Waiting for a free slot…',
  provisioning: 'Starting up…',
  running: 'Building your game…',
  succeeded: 'Done',
  failed: 'Failed',
};

export function App() {
  const [prompt, setPrompt] = useState('');
  const [game, setGame] = useState<GeneratedGame | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [jobState, setJobState] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setStatus('loading');
    setError(null);
    setGame(null);
    setJobState(null);
    try {
      setGame(await generateGameViaJob(trimmed, { onState: setJobState }));
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    } finally {
      setJobState(null);
    }
  }

  const busyLabel = jobState ? STATE_LABELS[jobState] : 'Building your game…';

  return (
    <div className="app">
      <header className="app-header">
        <a href="/" className="logo">
          <img src={logo} alt="Gamedev.pl" width="70" height="60" />
          gamedev<span className="turquoise">.pl</span>
        </a>
        <a className="github" href="https://github.com/gamedevpl/www.gamedev.pl" aria-label="GitHub">
          <img src={githubIcon} alt="" />
        </a>
      </header>

      <main className="content">
        <h1 className="page-title">Describe a game. We build it. You play it.</h1>

        <section className="panel prompt-panel">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. dodge the falling rocks and survive as long as you can"
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(prompt);
            }}
          />
          <div className="prompt-actions">
            <button onClick={() => handleGenerate(prompt)} disabled={status === 'loading' || !prompt.trim()}>
              {status === 'loading' ? 'Building…' : 'Generate game'}
            </button>
            {status === 'loading' && <span className="job-state">{busyLabel}</span>}
          </div>
          <div className="suggestions">
            {SUGGESTIONS.map((suggestion) => (
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
                {game.description && <p>{game.description}</p>}
              </div>
              <GameFrame key={game.html} title={game.title} html={game.html} />
            </>
          ) : (
            <div className="empty-stage">{status === 'loading' ? busyLabel : 'Your game will appear here.'}</div>
          )}
        </section>
      </main>
    </div>
  );
}
