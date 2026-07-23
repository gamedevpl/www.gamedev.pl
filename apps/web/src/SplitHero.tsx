import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from './catalog';

type SplitHeroProps = {
  featuredGame: CatalogEntry | null;
  onPlayFeatured: (game: CatalogEntry) => void;
  onRemixFeatured: (game: CatalogEntry) => void;
  onQuickSubmitSpec: (concept: string) => void;
  onQuickGenerateMock: (prompt: string) => void;
};

export function SplitHero({
  featuredGame,
  onPlayFeatured,
  onRemixFeatured,
  onQuickSubmitSpec,
  onQuickGenerateMock,
}: SplitHeroProps) {
  const { t } = useTranslation();
  const [promptText, setPromptText] = useState('');

  const suggestions = [t('suggestions.dodge'), t('suggestions.collect'), t('suggestions.space')];

  return (
    <section className="hero-section">
      <div className="hero-header">
        <h1 className="hero-title">{t('hero.title')}</h1>
        <p className="hero-subtitle">{t('hero.subtitle')}</p>
      </div>

      <div className="hero-spotlight-grid">
        {/* LEFT SPOTLIGHT: PLAY FEATURED GAME */}
        <div className="hero-card play-spotlight">
          <div className="spotlight-header">
            <span className="badge-featured">{t('hero.playSpotlightTitle')}</span>
            <span className="spotlight-meta">{t('hero.playSpotlightBadge')}</span>
          </div>

          <div className="spotlight-body">
            <h3>{featuredGame ? featuredGame.title : 'Sky Dodge Deluxe'}</h3>
            <p className="spotlight-desc">
              {featuredGame
                ? t('catalog.controlsSummary', { controls: featuredGame.controls })
                : 'Dodge procedural obstacles and collect powerups in a sandboxed HTML5 physics canvas.'}
            </p>
          </div>

          <div className="spotlight-actions">
            {featuredGame ? (
              <>
                <button className="primary-btn" onClick={() => onPlayFeatured(featuredGame)}>
                  {t('hero.playInStage')}
                </button>
                <button className="secondary-btn" onClick={() => onRemixFeatured(featuredGame)}>
                  {t('hero.remixButton')}
                </button>
              </>
            ) : (
              <a href="#studio" className="primary-btn inline-btn">
                ⚡ {t('hero.createTitle')}
              </a>
            )}
          </div>
        </div>

        {/* RIGHT SPOTLIGHT: INSTANT CREATOR PROMPT */}
        <div className="hero-card create-spotlight">
          <div className="spotlight-header">
            <span className="badge-create">{t('hero.createTitle')}</span>
          </div>

          <p className="create-subtitle">{t('hero.createSubtitle')}</p>

          <div className="quick-prompt-form">
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={t('hero.quickPromptPlaceholder')}
              rows={3}
            />

            <div className="chip-container">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" className="chip-btn" onClick={() => setPromptText(suggestion)}>
                  + {suggestion}
                </button>
              ))}
            </div>

            <div className="quick-actions">
              <button
                type="button"
                className="primary-btn"
                disabled={!promptText.trim()}
                onClick={() => onQuickSubmitSpec(promptText)}
              >
                {t('hero.quickSubmit')}
              </button>
              <button
                type="button"
                className="secondary-btn"
                disabled={!promptText.trim()}
                onClick={() => onQuickGenerateMock(promptText)}
              >
                {t('hero.tryMock')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
