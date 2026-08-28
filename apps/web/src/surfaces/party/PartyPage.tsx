import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogRail } from '../catalog/CatalogRail.js';
import type { CatalogEntry } from '../../catalog.js';
import { MascotMoment } from '../../Mascot.js';
import { PartyDiagram } from './PartyDiagram.js';
import { PixelIcon } from '../../PixelIcon.js';
import type { PlayVia } from '../../visitTelemetry.js';

type PartyPageProps = {
  catalogStatus: 'loading' | 'ready' | 'error';
  catalogError: string | null;
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  onPlayTogether: (game: CatalogEntry, via?: PlayVia) => void;
  onRetryCatalog: () => void;
  onCreateCustom: () => void;
  // Set when Play Together on this rail failed to open a lobby.
  partyError: string | null;
};

const STEP_KEYS = ['step1', 'step2', 'step3'];

// /party: a real destination now, not the old scroll-to-rail anchor.
export function PartyPage({
  catalogStatus,
  catalogError,
  catalogEntries,
  onPlayGame,
  onPlayTogether,
  onRetryCatalog,
  onCreateCustom,
  partyError,
}: PartyPageProps) {
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

      <PartyDiagram />

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

      {partyError ? <p className="error party-error">{partyError}</p> : null}

      {catalogStatus === 'ready' && catalogError ? (
        <div className="catalog-refresh-error" role="status">
          <p className="catalog-refresh-error__text">{t('catalog.refreshError', { message: catalogError })}</p>
          <button type="button" className="secondary-btn catalog-refresh-error__retry" onClick={onRetryCatalog}>
            <PixelIcon name="undo" size={13} /> {t('catalog.retry')}
          </button>
        </div>
      ) : null}

      {catalogStatus === 'loading' ? (
        <MascotMoment className="catalog-state" emotion="busy" size={56} title={t('mascot.busyAlt')}>
          <p>{t('catalog.loading')}</p>
        </MascotMoment>
      ) : catalogStatus === 'error' ? (
        <MascotMoment className="load-error" emotion="sad" size={64} title={t('mascot.sadAlt')}>
          <p className="error" role="alert">
            {t('catalog.error', { message: catalogError ?? t('errors.generic') })}
          </p>
          <button type="button" className="secondary-btn" onClick={onRetryCatalog}>
            <PixelIcon name="undo" size={13} /> {t('catalog.retry')}
          </button>
        </MascotMoment>
      ) : partyEntries.length > 0 ? (
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
