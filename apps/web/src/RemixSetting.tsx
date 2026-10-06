import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRemixMode, setRemixMode, type RemixMode, type RemixScope } from './remixSettingsApi.js';
import './propose-composer.css';

// Owner or admin switch: may players bend this game? Default off.
export function RemixSetting(props: { slug: string; scope?: RemixScope }) {
  const scope = props.scope ?? 'owner';
  const { t } = useTranslation();
  const [mode, setMode] = useState<RemixMode | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Not the owner, or an older server: show no switch.
    getRemixMode(props.slug, scope)
      .then((next) => !cancelled && setMode(next))
      .catch(() => !cancelled && setMode(null));
    return () => {
      cancelled = true;
    };
  }, [props.slug, scope]);

  const choose = useCallback(
    (next: RemixMode) => {
      if (next === mode || saving) return;
      setSaving(true);
      // Optimistic, like the contributions switch: a failure puts it back.
      const previous = mode;
      setMode(next);
      void setRemixMode(props.slug, next, scope)
        .catch(() => setMode(previous))
        .finally(() => setSaving(false));
    },
    [mode, props.slug, saving, scope],
  );

  if (mode === null) return null;

  return (
    <section className="contributions-setting" aria-label={t('reviews.contributions.remixTitle')}>
      <h3>{t('reviews.contributions.remixTitle')}</h3>
      <div className="contributions-options" role="radiogroup" aria-label={t('reviews.contributions.remixTitle')}>
        {(['off', 'on'] as const).map((value) => {
          const key = value === 'on' ? 'remixOn' : 'remixOff';
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mode === value}
              className={`contributions-option${mode === value ? ' is-on' : ''}`}
              onClick={() => choose(value)}
            >
              <span className="contributions-option-title">{t(`reviews.contributions.${key}`)}</span>
              <span className="contributions-option-help">{t(`reviews.contributions.${key}Help`)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
