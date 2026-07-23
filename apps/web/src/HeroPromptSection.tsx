import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from './catalog.js';

type HeroPromptSectionProps = {
  initialPrompt?: string;
  catalogEntries?: CatalogEntry[];
  onPlayGame?: (entry: CatalogEntry) => void;
  submissionStatus: 'idle' | 'loading';
  submissionError: string | null;
  onSubmitSpec: (title: string, concept: string) => void;
  mockStatus: 'idle' | 'loading' | 'error';
  mockError: string | null;
  onGenerateMock: (prompt: string) => void;
};

function findMatchingGame(query: string, catalog: CatalogEntry[]): CatalogEntry | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized || normalized.length < 2) return null;

  const tokens = normalized.split(/\s+/).filter((t) => t.length > 1);

  for (const entry of catalog) {
    const title = entry.title.toLowerCase();
    const genre = entry.genre.toLowerCase();
    const controls = entry.controls.toLowerCase();
    const slug = entry.slug.toLowerCase();

    // 1. Direct match in title or slug
    if (title.includes(normalized) || normalized.includes(title) || slug.includes(normalized)) {
      return entry;
    }

    // 2. Special aliases
    if (normalized.includes('mario') && (slug.includes('plumber') || title.includes('plumber'))) {
      return entry;
    }
    if (normalized.includes('coin') && slug.includes('coin')) {
      return entry;
    }
    if ((normalized.includes('rock') || normalized.includes('dodge')) && slug.includes('rock')) {
      return entry;
    }
    if (
      (normalized.includes('space') ||
        normalized.includes('ship') ||
        normalized.includes('rocket') ||
        normalized.includes('fly')) &&
      slug.includes('asteroid')
    ) {
      return entry;
    }

    // 3. Token match
    const matchCount = tokens.filter((t) => title.includes(t) || genre.includes(t) || controls.includes(t)).length;
    if (matchCount > 0 && matchCount >= Math.ceil(tokens.length / 2)) {
      return entry;
    }
  }

  return null;
}

export function HeroPromptSection({
  initialPrompt = '',
  catalogEntries = [],
  onPlayGame,
  submissionStatus,
  submissionError,
  onSubmitSpec,
  mockStatus,
  mockError,
  onGenerateMock,
}: HeroPromptSectionProps) {
  const { t } = useTranslation();
  const [promptText, setPromptText] = useState(initialPrompt);

  const matchedGame = useMemo(() => findMatchingGame(promptText, catalogEntries), [promptText, catalogEntries]);

  const suggestions = [t('suggestions.dodge'), t('suggestions.collect'), t('suggestions.space')];

  const handlePrimarySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptText.trim();
    if (!trimmed) return;
    onGenerateMock(trimmed);
    const autoTitle = trimmed.slice(0, 40).trim() || 'My AI Game';
    onSubmitSpec(autoTitle, trimmed);
  };

  return (
    <section className="hero-prompt-section">
      <div className="hero-text-container">
        <h1 className="hero-headline">{t('hero.mainTitle')}</h1>
        <p className="hero-subheadline">{t('hero.mainSubtitle')}</p>
      </div>

      <div className="hero-prompt-card">
        <form onSubmit={handlePrimarySubmit} className="prompt-box-form">
          <textarea
            className="big-prompt-input"
            autoFocus
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder={t('hero.bigPromptPlaceholder')}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handlePrimarySubmit(e);
              }
            }}
          />

          {matchedGame && (
            <div className="smart-intent-card matched-card">
              <div className="matched-info">
                <span className="smart-badge">
                  🎮 {t('catalog.genre')}: {matchedGame.genre}
                </span>
                <h3 className="matched-title">{matchedGame.title}</h3>
                <p className="matched-desc">
                  {t('catalog.controls')}: {matchedGame.controls}
                </p>
              </div>
              <div className="matched-actions">
                <button type="button" className="primary-btn play-match-btn" onClick={() => onPlayGame?.(matchedGame)}>
                  ▶ {t('hero.smartPlayBtn', { title: matchedGame.title })}
                </button>
                <button
                  type="button"
                  className="secondary-btn remix-match-btn"
                  onClick={() => {
                    setPromptText(
                      `Remix of ${matchedGame.title}: add higher difficulty, new powerups, and neon visuals!`,
                    );
                  }}
                >
                  ⚡ {t('hero.smartRemixBtn')}
                </button>
              </div>
            </div>
          )}

          {!matchedGame && promptText.trim().length >= 3 && (
            <div className="smart-intent-card creation-card">
              <div className="creation-info">
                <span className="smart-badge creation-badge">
                  ✨ {t('hero.smartNoMatchTitle', { query: promptText.trim() })}
                </span>
                <p className="creation-sub">{t('hero.smartNoMatchSub')}</p>
              </div>
            </div>
          )}

          <div className="prompt-controls-bar">
            <div className="chip-container">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" className="chip-btn" onClick={() => setPromptText(suggestion)}>
                  + {suggestion}
                </button>
              ))}
            </div>

            <div className="action-buttons">
              <button
                type="submit"
                className="primary-btn build-btn"
                disabled={submissionStatus === 'loading' || mockStatus === 'loading' || !promptText.trim()}
              >
                🚀{' '}
                {submissionStatus === 'loading' || mockStatus === 'loading'
                  ? t('submit.submitting')
                  : t('hero.buildGameButton')}
              </button>
            </div>
          </div>
        </form>

        {submissionError && <p className="error">{submissionError}</p>}
        {mockError && <p className="error">{mockError}</p>}
      </div>
    </section>
  );
}
