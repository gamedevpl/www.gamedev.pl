import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SavedSpec } from './mySpecs';

import { CreatorQA, type QAQuestion } from './CreatorQA';
import { refineSpec } from './submissionApi';

type CreatorStudioProps = {
  savedSpecs: SavedSpec[];
  initialTitle?: string;
  initialConcept?: string;
  remixSourceTitle?: string | null;
  submissionStatus: 'idle' | 'loading';
  submissionError: string | null;
  onSubmitSpec: (title: string, concept: string, displayName: string) => void;
  onTrackToken: (token: string) => void;
  // Demo generator
  showDemoGenerator: boolean;
  onToggleDemoGenerator: () => void;
  mockPrompt: string;
  onMockPromptChange: (val: string) => void;
  mockStatus: 'idle' | 'loading' | 'error';
  mockError: string | null;
  onGenerateMock: (prompt: string) => void;
};

export function CreatorStudio({
  savedSpecs,
  initialTitle = '',
  initialConcept = '',
  remixSourceTitle,
  submissionStatus,
  submissionError,
  onSubmitSpec,
  onTrackToken,
  showDemoGenerator,
  onToggleDemoGenerator,
  mockPrompt,
  onMockPromptChange,
  mockStatus,
  mockError,
  onGenerateMock,
}: CreatorStudioProps) {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<'greenfield' | 'active'>('greenfield');
  const [title, setTitle] = useState(initialTitle);
  const [concept, setConcept] = useState(initialConcept);
  const [displayName, setDisplayName] = useState('');
  const [inputToken, setInputToken] = useState('');

  const [qaQuestions, setQaQuestions] = useState<QAQuestion[]>([]);
  const [refineStatus, setRefineStatus] = useState<'idle' | 'loading'>('idle');
  const [refineError, setRefineError] = useState<string | null>(null);

  const suggestions = [t('suggestions.dodge'), t('suggestions.collect'), t('suggestions.space')];

  const handleRefine = async () => {
    if (!title.trim() || !concept.trim()) return;
    setRefineStatus('loading');
    setRefineError(null);
    try {
      const res = await refineSpec({
        title: title.trim(),
        concept: concept.trim(),
        locale: i18n.language,
      });
      if (res.questions && res.questions.length > 0) {
        setQaQuestions(res.questions);
      } else {
        // Fail-open or clean prompt: directly submit
        onSubmitSpec(title.trim(), concept.trim(), displayName.trim());
      }
    } catch (err) {
      // Fail-open on error: proceed to submit directly
      onSubmitSpec(title.trim(), concept.trim(), displayName.trim());
    } finally {
      setRefineStatus('idle');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !concept.trim()) return;
    onSubmitSpec(title.trim(), concept.trim(), displayName.trim());
  };

  const handleTrackSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputToken.trim();
    if (!trimmed) return;
    // Extract token if user pasted full URL
    const token = trimmed.includes('#status:') ? trimmed.split('#status:')[1] : trimmed;
    onTrackToken(token);
  };

  return (
    <section id="studio" className="panel studio-panel">
      <div className="section-header">
        <h2 className="section-title">⚡ {t('studio.title')}</h2>
        <div className="studio-tabs">
          <button
            className={`tab-btn ${activeTab === 'greenfield' ? 'active' : ''}`}
            onClick={() => setActiveTab('greenfield')}
          >
            {t('studio.tabGreenfield')}
          </button>
          <button
            className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
            onClick={() => setActiveTab('active')}
          >
            {t('studio.tabActive', { count: savedSpecs.length })}
          </button>
        </div>
      </div>

      {activeTab === 'greenfield' ? (
        <div className="tab-content greenfield-flow">
          {remixSourceTitle && (
            <div className="remix-banner">
              <strong>{t('studio.remixHeader', { title: remixSourceTitle })}</strong>
              <p>{t('studio.remixHint')}</p>
            </div>
          )}

          <p className="panel-copy">{t('submit.description')}</p>

          <form className="submission-form" onSubmit={handleSubmit}>
            <label className="field">
              <span>{t('submit.titleLabel')}</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder={t('submit.titlePlaceholder')}
                required
              />
              <small className="field-hint">{t('submit.titleHint')}</small>
            </label>

            <label className="field">
              <span>{t('submit.conceptLabel')}</span>
              <textarea
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder={t('submit.conceptPlaceholder')}
                rows={5}
                required
              />
              <small className="field-hint">{t('submit.conceptHint')}</small>
            </label>

            <label className="field">
              <span>{t('submit.displayNameLabel')}</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={40}
                placeholder={t('submit.displayNamePlaceholder')}
              />
              <small className="field-hint">{t('submit.displayNameHint')}</small>
            </label>

            <div className="prompt-actions">
              <button
                type="submit"
                className="primary-btn"
                disabled={
                  submissionStatus === 'loading' || refineStatus === 'loading' || !title.trim() || !concept.trim()
                }
              >
                {submissionStatus === 'loading' ? t('submit.submitting') : t('submit.submit')}
              </button>
              <button
                type="button"
                className="secondary-btn"
                onClick={() => void handleRefine()}
                disabled={
                  submissionStatus === 'loading' || refineStatus === 'loading' || !title.trim() || !concept.trim()
                }
              >
                {refineStatus === 'loading' ? t('qa.analyzing') : `✨ ${t('qa.title')}`}
              </button>
            </div>
          </form>

          {qaQuestions.length > 0 && (
            <CreatorQA
              questions={qaQuestions}
              initialConcept={concept}
              onSubmitWithConcept={(finalConcept) => {
                setQaQuestions([]);
                onSubmitSpec(title.trim(), finalConcept, displayName.trim());
              }}
              onCancel={() => setQaQuestions([])}
            />
          )}

          {submissionError && <p className="error">{submissionError}</p>}
          {refineError && <p className="error">{refineError}</p>}

          <div className="demo-toggle-container">
            <button className="toggle-link" onClick={onToggleDemoGenerator} type="button">
              {showDemoGenerator ? t('submit.demoHide') : t('submit.demoToggle')}
            </button>
          </div>

          {showDemoGenerator && (
            <div className="demo-generator">
              <h3 className="demo-title">{t('home.mockTitle')}</h3>
              <textarea
                value={mockPrompt}
                onChange={(e) => onMockPromptChange(e.target.value)}
                placeholder={t('home.promptPlaceholder')}
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onGenerateMock(mockPrompt);
                }}
              />
              <div className="prompt-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => onGenerateMock(mockPrompt)}
                  disabled={mockStatus === 'loading' || !mockPrompt.trim()}
                >
                  {mockStatus === 'loading' ? t('home.building') : t('home.generate')}
                </button>
              </div>
              <div className="suggestions">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    className="chip"
                    onClick={() => {
                      onMockPromptChange(suggestion);
                      onGenerateMock(suggestion);
                    }}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              {mockError && <p className="error">{mockError}</p>}
            </div>
          )}
        </div>
      ) : (
        <div className="tab-content active-flow">
          <div className="track-manual-card">
            <h3>{t('studio.enterTokenTitle')}</h3>
            <form onSubmit={handleTrackSubmit} className="inline-form">
              <input
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                placeholder={t('studio.tokenPlaceholder')}
              />
              <button type="submit" className="primary-btn" disabled={!inputToken.trim()}>
                {t('studio.trackButton')}
              </button>
            </form>
          </div>

          <div className="my-specs-list">
            <h3>{t('studio.mySpecsTitle')}</h3>
            {savedSpecs.length === 0 ? (
              <p className="panel-copy">{t('studio.noSpecs')}</p>
            ) : (
              <div className="saved-specs-grid">
                {savedSpecs.map((spec) => (
                  <div key={spec.token} className="spec-card">
                    <div className="spec-card-body">
                      <h4>{spec.title}</h4>
                      <p className="spec-token-code">Token: {spec.token.slice(0, 12)}…</p>
                      <p className="spec-date">{new Date(spec.createdAt).toLocaleDateString()}</p>
                    </div>
                    <button className="primary-btn" onClick={() => onTrackToken(spec.token)}>
                      🔍 Track Status
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
