import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from './catalog.js';
import { HeroPromptSection } from './HeroPromptSection.js';
import { PixelIcon, type PixelIconName } from './PixelIcon.js';
import type { PlatformBuilderAvailability } from './submissionApi.js';
import type { PlayVia } from './visitTelemetry.js';

type CreatePageProps = {
  initialPrompt: string;
  retryKey: string;
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  submissionStatus: 'idle' | 'refining' | 'loading';
  submissionError: string | null;
  onSubmitSpec: (concept: string) => void;
  mockStatus: 'idle' | 'loading' | 'error';
  mockError: string | null;
  onGenerateMock: (prompt: string) => void;
  onPlatformBuilderAvailability: (availability: PlatformBuilderAvailability | undefined) => void;
};

const STEPS: { key: string; icon: PixelIconName }[] = [
  { key: 'step1', icon: 'sparkle' },
  { key: 'step2', icon: 'gamepad' },
  { key: 'step3', icon: 'chat' },
  { key: 'step4', icon: 'rocket' },
];

// /create: the creation landing page. No ETA anywhere on it, ever.
export function CreatePage({
  initialPrompt,
  retryKey,
  catalogEntries,
  onPlayGame,
  submissionStatus,
  submissionError,
  onSubmitSpec,
  mockStatus,
  mockError,
  onGenerateMock,
  onPlatformBuilderAvailability,
}: CreatePageProps) {
  const { t } = useTranslation();

  const proof = useMemo(() => {
    const genres = new Set(catalogEntries.map((entry) => entry.genre)).size;
    const partyReady = catalogEntries.filter((entry) => entry.multiplayer).length;
    return { games: catalogEntries.length, genres, partyReady };
  }, [catalogEntries]);

  return (
    <div className="create-page">
      <header className="create-intro">
        <h1 className="create-headline">{t('create.headline')}</h1>
        <p className="create-subhead">{t('create.subhead')}</p>
      </header>

      <div id="hero-prompt">
        <HeroPromptSection
          key={retryKey}
          initialPrompt={initialPrompt}
          catalogEntries={catalogEntries}
          onPlayGame={onPlayGame}
          submissionStatus={submissionStatus}
          submissionError={submissionError}
          onSubmitSpec={onSubmitSpec}
          mockStatus={mockStatus}
          mockError={mockError}
          onGenerateMock={onGenerateMock}
          onPlatformBuilderAvailability={onPlatformBuilderAvailability}
        />
      </div>

      <section className="create-steps" aria-labelledby="create-steps-heading">
        <h2 id="create-steps-heading" className="create-section-heading">
          {t('create.stepsHeading')}
        </h2>
        <ol className="create-steps-list">
          {STEPS.map((step) => (
            <li key={step.key} className="create-step">
              <span className="create-step-icon" aria-hidden="true">
                <PixelIcon name={step.icon} size={18} />
              </span>
              <div>
                <h3 className="create-step-title">{t(`create.${step.key}Title`)}</h3>
                <p className="create-step-detail">{t(`create.${step.key}Detail`)}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="create-notify-note">
          <PixelIcon name="signal" size={13} /> {t('create.notifyNote')}
        </p>
      </section>

      <section className="create-builders" aria-labelledby="create-builders-heading">
        <h2 id="create-builders-heading" className="create-section-heading">
          {t('create.buildersHeading')}
        </h2>
        <p className="create-builders-sub">{t('create.buildersSub')}</p>
        <div className="create-builder-lanes">
          <div className="create-builder-lane">
            <span className="create-builder-lane-title">{t('builder.platform.title')}</span>
            <p className="create-builder-lane-detail">{t('builder.platform.detail')}</p>
          </div>
          <div className="create-builder-lane">
            <span className="create-builder-lane-title">{t('builder.self.title')}</span>
            <p className="create-builder-lane-detail">{t('builder.self.detail')}</p>
            <span className="create-builder-lane-badge">{t('create.byoFreeBadge')}</span>
          </div>
        </div>
      </section>

      <section className="create-proof" aria-label={t('create.proofHeading')}>
        <div className="create-proof-stat">
          <strong>{proof.games}</strong>
          <span>{t('create.proofGames')}</span>
        </div>
        <div className="create-proof-stat">
          <strong>{proof.genres}</strong>
          <span>{t('create.proofGenres')}</span>
        </div>
        <div className="create-proof-stat">
          <strong>{proof.partyReady}</strong>
          <span>{t('create.proofParty')}</span>
        </div>
      </section>
    </div>
  );
}
