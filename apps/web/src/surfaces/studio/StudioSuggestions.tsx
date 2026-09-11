import type { DismissReason } from '@gamedevpl/contract';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  approveSuggestion,
  dismissSuggestion,
  fetchStudioSuggestions,
  type StudioSuggestion,
} from '../../studioApi.js';

// The suggestion inbox for one game (improvement-loop IL-3).

// Measured evidence and player-authored words stay in separate blocks.

// Approving can succeed without an implementer; `no-implementer` is an outcome.
export function SuggestedImprovements({ slug }: { slug: string | undefined }) {
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<StudioSuggestion[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStudioSuggestions()
      .then((rows) => {
        if (!cancelled) setSuggestions(rows);
      })
      // A failed queue must not take the stats page down.
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const mine = useMemo(
    () => (suggestions ?? []).filter((entry) => entry.slug === slug && entry.status === 'proposed'),
    [suggestions, slug],
  );

  const replace = (updated: StudioSuggestion) =>
    setSuggestions((rows) => (rows ?? []).map((row) => (row.id === updated.id ? updated : row)));

  const decided = (suggestions ?? []).filter(
    (entry) => entry.slug === slug && (entry.status === 'dispatched' || entry.status === 'no-implementer'),
  );

  async function act(id: string, run: () => Promise<StudioSuggestion>) {
    setBusyId(id);
    setError(null);
    try {
      replace(await run());
      setDismissing(null);
    } catch (caught) {
      const status = (caught as { status?: number }).status;
      setError(status === 429 ? t('studioPanel.suggestions.quota') : t('studioPanel.suggestions.failed'));
    } finally {
      setBusyId(null);
    }
  }

  if (suggestions === null || (mine.length === 0 && decided.length === 0)) return null;

  return (
    <div className="studio-suggestions">
      <h3 className="health-section-title">{t('studioPanel.suggestions.title')}</h3>
      <p className="health-note">{t('studioPanel.suggestions.note')}</p>
      {error ? <p className="studio-error">{error}</p> : null}

      {decided.map((entry) => (
        <p key={entry.id} className="studio-suggestion-outcome">
          {entry.status === 'dispatched'
            ? t('studioPanel.suggestions.filed')
            : t('studioPanel.suggestions.noImplementer')}
        </p>
      ))}

      {mine.map((entry) => (
        <article key={entry.id} className="studio-suggestion">
          <h4 className="studio-suggestion-class">{classLabel(entry.class, t)}</h4>

          <ul className="studio-suggestion-evidence">
            {entry.evidence.map((item) => (
              <li key={item.finding}>{item.finding}</li>
            ))}
          </ul>

          <SuggestionContext context={entry.untrustedContext} />

          {dismissing === entry.id ? (
            <div className="studio-suggestion-reasons">
              <p>{t('studioPanel.suggestions.dismissReason')}</p>
              {DISMISS_REASON_KEYS.map(([reason, key]) => (
                <button
                  key={reason}
                  type="button"
                  className="studio-suggestion-reason"
                  disabled={busyId === entry.id}
                  onClick={() => act(entry.id, () => dismissSuggestion(entry.id, reason))}
                >
                  {t(key)}
                </button>
              ))}
            </div>
          ) : (
            <div className="studio-suggestion-actions">
              <button
                type="button"
                className="studio-suggestion-approve"
                disabled={busyId === entry.id}
                onClick={() => act(entry.id, () => approveSuggestion(entry.id))}
                title={t('studioPanel.suggestions.approveHint')}
              >
                {t('studioPanel.suggestions.approve')}
              </button>
              <button
                type="button"
                className="studio-suggestion-dismiss"
                disabled={busyId === entry.id}
                onClick={() => setDismissing(entry.id)}
              >
                {t('studioPanel.suggestions.dismiss')}
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

// The fixed dismissal vocabulary the API accepts, with translation keys.
const DISMISS_REASON_KEYS: Array<[DismissReason, string]> = [
  ['intentional', 'studioPanel.suggestions.reasonIntentional'],
  ['not-a-problem', 'studioPanel.suggestions.reasonNotAProblem'],
  ['wont-fix', 'studioPanel.suggestions.reasonWontFix'],
  ['not-now', 'studioPanel.suggestions.reasonNotNow'],
  ['bad-evidence', 'studioPanel.suggestions.reasonBadEvidence'],
];

function classLabel(suggestionClass: string, t: (key: string) => string): string {
  if (suggestionClass === 'defect') return t('studioPanel.suggestions.classDefect');
  if (suggestionClass === 'friction') return t('studioPanel.suggestions.classFriction');
  if (suggestionClass === 'design-change') return t('studioPanel.suggestions.classDesignChange');
  if (suggestionClass === 'editorial') return t('studioPanel.suggestions.classEditorial');
  return suggestionClass;
}

// Game- and player-authored strings, kept separate from what we measured.
function SuggestionContext({ context }: { context: StudioSuggestion['untrustedContext'] }) {
  const { t } = useTranslation();
  const samples = context?.errorSamples ?? [];
  const themes = context?.feedbackThemes ?? [];
  if (!samples.length && !themes.length) return null;

  return (
    <div className="studio-suggestion-context">
      <h5 className="studio-themes-title">{t('studioPanel.suggestions.context')}</h5>
      <p className="health-note">{t('studioPanel.suggestions.contextNote')}</p>
      <ul className="studio-theme-list">
        {samples.map((sample) => (
          <li key={sample.message}>
            {sample.message} <span className="health-error-count">×{sample.count}</span>
          </li>
        ))}
        {themes.map((theme) => (
          <li key={theme.theme}>
            {theme.theme} <span className="health-error-count">×{theme.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
