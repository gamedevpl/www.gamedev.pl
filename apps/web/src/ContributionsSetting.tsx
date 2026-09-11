import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getContributionMode,
  listContributorBlocks,
  setContributionMode,
  unblockContributor,
  type ContributionMode,
  type ContributorBlock,
} from './proposalsApi.js';
import './propose-composer.css';

/**
 * The contributions switch, and the block list beside it.
 *
 * This is the creator-veto question rendered as one control, deliberately: the same
 * question is asked by remix shares and by proposals, and answering it twice in two places
 * is how a creator ends up with a game that is open in one sense and shut in another.
 *
 * `off` is the default and it is written first, which is the honest order — a creator who
 * has never thought about this has it off, and the radio that is selected when they arrive
 * should be the one describing what is already true.
 *
 * The blocked list lives here rather than in account settings because blocking, in
 * practice, happens in response to a specific proposal on a specific game, and the place
 * someone looks for "make that stop" is the game they were looking at.
 */
export function ContributionsSetting(props: { slug: string }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<ContributionMode | null>(null);
  const [blocks, setBlocks] = useState<ContributorBlock[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    // A 404 here means this is not the caller's game, which the Studio should not have
    // rendered — the control simply stays absent rather than showing a broken switch.
    getContributionMode(props.slug)
      .then(setMode)
      .catch(() => setMode(null));
    listContributorBlocks()
      .then(setBlocks)
      .catch(() => setBlocks([]));
  }, [props.slug]);

  useEffect(load, [load]);

  const choose = useCallback(
    (next: ContributionMode) => {
      if (next === mode || saving) return;
      setSaving(true);
      // Optimistic: the switch is the whole interaction, and a spinner on a radio reads
      // as breakage. A failure puts it back, which is visible and self-explaining.
      const previous = mode;
      setMode(next);
      void setContributionMode(props.slug, next)
        .catch(() => setMode(previous))
        .finally(() => setSaving(false));
    },
    [mode, props.slug, saving],
  );

  if (mode === null) return null;

  return (
    <section className="contributions-setting" aria-label={t('reviews.contributions.title')}>
      <h3>{t('reviews.contributions.title')}</h3>

      <div className="contributions-options" role="radiogroup" aria-label={t('reviews.contributions.title')}>
        {(['off', 'review'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            className={`contributions-option${mode === value ? ' is-on' : ''}`}
            onClick={() => choose(value)}
          >
            <span className="contributions-option-title">{t(`reviews.contributions.${value}`)}</span>
            <span className="contributions-option-help">{t(`reviews.contributions.${value}Help`)}</span>
          </button>
        ))}
      </div>

      {blocks.length > 0 ? (
        <>
          <h4>{t('reviews.contributions.blocked')}</h4>
          <ul className="contributions-blocks">
            {blocks.map((block) => (
              <li key={block.blockedUid}>
                <span>{block.blockedUid}</span>
                <button
                  type="button"
                  className="remix-btn is-quiet"
                  onClick={() => void unblockContributor(block.blockedUid).then(load)}
                >
                  {t('reviews.contributions.unblock')}
                </button>
              </li>
            ))}
          </ul>
          <p className="propose-note">{t('reviews.contributions.blockedHelp')}</p>
        </>
      ) : null}
    </section>
  );
}
