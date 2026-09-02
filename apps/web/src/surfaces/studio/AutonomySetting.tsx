import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchGameAutonomy, setGameAutonomy, type AutonomyMode } from '../../studioApi.js';

// What the platform may do to this game without asking (IL-4).

// Permission, not a feature toggle: nothing ships without creator review.
export function AutonomySetting({ slug }: { slug: string | undefined }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AutonomyMode | null>(null);
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetchGameAutonomy(slug)
      .then((value) => {
        if (!cancelled) setMode(value);
      })
      // No control to show must not break the stats page.
      .catch(() => {
        if (!cancelled) setMode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug || mode === null) return null;

  async function choose(next: AutonomyMode) {
    if (!slug) return;
    const previous = mode;
    setMode(next);
    setState('saving');
    try {
      setMode(await setGameAutonomy(slug, next));
      setState('saved');
    } catch {
      // Put it back rather than show a setting that is unstored.
      setMode(previous);
      setState('error');
    }
  }

  return (
    <div className="studio-autonomy">
      <h3 className="health-section-title">{t('studioPanel.autonomy.title')}</h3>
      <p className="health-note">{t('studioPanel.autonomy.note')}</p>
      <ul className="studio-autonomy-options">
        {AUTONOMY_CHOICES.map(([value, labelKey, hintKey]) => (
          <li key={value}>
            <label className={value === mode ? 'studio-autonomy-option is-active' : 'studio-autonomy-option'}>
              <input
                type="radio"
                name={`autonomy-${slug}`}
                checked={value === mode}
                disabled={state === 'saving'}
                onChange={() => choose(value)}
              />
              <span>
                <strong>{t(labelKey)}</strong>
                <small>{t(hintKey)}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {state === 'error' ? <p className="studio-error">{t('studioPanel.autonomy.failed')}</p> : null}
      {state === 'saved' ? <p className="studio-autonomy-saved">{t('studioPanel.autonomy.saved')}</p> : null}
    </div>
  );
}

// Ordered least to most permission, so it reads as a scale.
const AUTONOMY_CHOICES: Array<[AutonomyMode, string, string]> = [
  ['digest-only', 'studioPanel.autonomy.digestOnly', 'studioPanel.autonomy.digestOnlyHint'],
  ['suggest', 'studioPanel.autonomy.suggest', 'studioPanel.autonomy.suggestHint'],
  ['auto-fix-defects', 'studioPanel.autonomy.autoFixDefects', 'studioPanel.autonomy.autoFixDefectsHint'],
  ['auto-tune', 'studioPanel.autonomy.autoTune', 'studioPanel.autonomy.autoTuneHint'],
];
