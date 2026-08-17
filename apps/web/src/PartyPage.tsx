import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogRail } from './CatalogRail.js';
import type { CatalogEntry } from './catalog.js';
import { PixelIcon } from './PixelIcon.js';
import type { PlayVia } from './visitTelemetry.js';

type PartyPageProps = {
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  onPlayTogether: (game: CatalogEntry, via?: PlayVia) => void;
  onCreateCustom: () => void;
};

const STEP_KEYS = ['step1', 'step2', 'step3'];

// /party: a real destination now, not the old scroll-to-rail anchor.
export function PartyPage({ catalogEntries, onPlayGame, onPlayTogether, onCreateCustom }: PartyPageProps) {
  const { t } = useTranslation();

  const partyEntries = useMemo(() => catalogEntries.filter((entry) => entry.multiplayer), [catalogEntries]);

  return (
    <div className="party-page">
      <header className="party-intro">
        <span className="party-kicker">
          <PixelIcon name="phone" size={13} /> {t('party.badge')}
        </span>
        <h1 className="party-headline">{t('party.pageHeadline')}</h1>
        <p className="party-subhead">{t('party.pageSubhead')}</p>
      </header>

      <section className="party-how" aria-labelledby="party-how-heading">
        <h2 id="party-how-heading" className="party-section-heading">
          {t('party.howHeading')}
        </h2>
        <ol className="party-steps-list">
          {STEP_KEYS.map((key, index) => (
            <li key={key} className="party-step">
              <span className="party-step-n" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="party-step-title">{t(`party.${key}Title`)}</h3>
              <p className="party-step-detail">{t(`party.${key}Detail`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {partyEntries.length > 0 ? (
        <CatalogRail
          heading={t('catalog.rails.party')}
          entries={partyEntries}
          via="party_page"
          onPlayGame={onPlayGame}
          onPlayTogether={onPlayTogether}
          headingAside={String(partyEntries.length)}
        />
      ) : (
        <p className="party-empty">{t('party.pageEmpty')}</p>
      )}

      <section className="party-custom" aria-labelledby="party-custom-heading">
        <h2 id="party-custom-heading" className="party-section-heading">
          {t('party.customHeading')}
        </h2>
        <p className="party-custom-detail">{t('party.customDetail')}</p>
        <button type="button" className="primary-btn party-custom-btn" onClick={onCreateCustom}>
          <PixelIcon name="sparkle" size={13} /> {t('party.customCta')}
        </button>
      </section>
    </div>
  );
}
