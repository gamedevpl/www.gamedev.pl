import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type HeroPromptSectionProps = {
  initialPrompt?: string;
  submissionStatus: 'idle' | 'loading';
  submissionError: string | null;
  onSubmitSpec: (title: string, concept: string) => void;
  mockStatus: 'idle' | 'loading' | 'error';
  mockError: string | null;
  onGenerateMock: (prompt: string) => void;
};

export function HeroPromptSection({
  initialPrompt = '',
  submissionStatus,
  submissionError,
  onSubmitSpec,
  mockStatus,
  mockError,
  onGenerateMock,
}: HeroPromptSectionProps) {
  const { t } = useTranslation();
  const [promptText, setPromptText] = useState(initialPrompt);

  const suggestions = [t('suggestions.dodge'), t('suggestions.collect'), t('suggestions.space')];

  const handlePrimarySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = promptText.trim();
    if (!trimmed) return;
    const autoTitle = trimmed.slice(0, 40).trim() || 'My AI Game';
    onSubmitSpec(autoTitle, trimmed);
  };

  const handleMockClick = () => {
    const trimmed = promptText.trim();
    if (!trimmed) return;
    onGenerateMock(trimmed);
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
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            placeholder={t('hero.bigPromptPlaceholder')}
            rows={4}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handlePrimarySubmit(e);
              }
            }}
          />

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
                disabled={submissionStatus === 'loading' || !promptText.trim()}
              >
                🚀 {submissionStatus === 'loading' ? t('submit.submitting') : t('hero.buildGameButton')}
              </button>
              <button
                type="button"
                className="secondary-btn mock-btn"
                disabled={mockStatus === 'loading' || !promptText.trim()}
                onClick={handleMockClick}
              >
                ⚡ {mockStatus === 'loading' ? t('home.building') : t('hero.instantMockButton')}
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
