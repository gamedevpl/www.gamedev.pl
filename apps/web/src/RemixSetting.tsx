import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getRemixMode, setRemixMode, type RemixMode } from './remixSettingsApi.js';

// Author's switch: may players bend this game for themselves? Default on.
export function RemixSetting(props: { slug: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<RemixMode | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Not the owner, or an older server: show no switch.
    getRemixMode(props.slug)
      .then((next) => !cancelled && setMode(next))
      .catch(() => !cancelled && setMode(null));
    return () => {
      cancelled = true;
    };
  }, [props.slug]);

  const choose = useCallback(
    (next: RemixMode) => {
      if (next === mode || saving) return;
      setSaving(true);
      // Optimistic, like the contributions switch: a failure puts it back.
      const previous = mode;
      setMode(next);
      void setRemixMode(props.slug, next)
        .catch(() => setMode(previous))
        .finally(() => setSaving(false));
    },
    [mode, props.slug, saving],
  );

  if (mode === null) return null;

  return (
    <section className="contributions-setting" aria-label={t('reviews.contributions.remixTitle')}>
      <h3>{t('reviews.contributions.remixTitle')}</h3>
      <div className="contributions-options" role="radiogroup" aria-label={t('reviews.contributions.remixTitle')}>
        {(['on', 'off'] as const).map((value) => {
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
