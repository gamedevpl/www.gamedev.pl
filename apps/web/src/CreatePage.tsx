import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogRail } from './CatalogRail.js';
import type { CatalogEntry } from './catalog.js';
import { HeroPromptSection } from './HeroPromptSection.js';
import { PixelIcon } from './PixelIcon.js';
import type { PlatformBuilderAvailability } from './submissionApi.js';
import type { PlayVia } from './visitTelemetry.js';

type CreatePageProps = {
  initialPrompt: string;
  retryKey: string;
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  submissionStatus: 'idle' | 'refining' | 'loading';
  submissionError: string | null;
  onSubmitSpec: (concept: string, referenceImages?: string[]) => void;
  onPlatformBuilderAvailability: (availability: PlatformBuilderAvailability | undefined) => void;
};

const STEP_KEYS = ['step1', 'step2', 'step3', 'step4'];

// Real catalog cards for the showcase, no new data — just a slice.
const SHOWCASE_LIMIT = 6;

// /create: the creation landing page. No ETA anywhere on it, ever.
export function CreatePage({
  initialPrompt,
  retryKey,
  catalogEntries,
  onPlayGame,
  submissionStatus,
  submissionError,
  onSubmitSpec,
  onPlatformBuilderAvailability,
}: CreatePageProps) {
  const { t } = useTranslation();

  const exampleChips = useMemo(() => [t('create.example1'), t('create.example2'), t('create.example3')], [t]);

  const showcaseEntries = useMemo(() => catalogEntries.slice(0, SHOWCASE_LIMIT), [catalogEntries]);

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
          onPlatformBuilderAvailability={onPlatformBuilderAvailability}
          exampleChips={exampleChips}
        />
      </div>

      <section className="create-steps" aria-labelledby="create-steps-heading">
        <h2 id="create-steps-heading" className="create-section-heading">
          {t('create.stepsHeading')}
        </h2>
        <ol className="create-steps-list">
          {STEP_KEYS.map((key, index) => (
            <li key={key} className="create-step">
              <span className="create-step-n" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="create-step-title">{t(`create.${key}Title`)}</h3>
              <p className="create-step-detail">{t(`create.${key}Detail`)}</p>
            </li>
          ))}
        </ol>
        <p className="create-notify-note">
          <PixelIcon name="signal" size={13} /> {t('create.notifyNote')}
        </p>
      </section>

      <section className="create-builders" aria-labelledby="create-builders-heading">
        <div className="create-builders-head">
          <h2 id="create-builders-heading" className="create-section-heading">
            {t('create.buildersHeading')}
          </h2>
          <span className="create-builders-sub">{t('create.buildersSub')}</span>
        </div>
        <div className="create-builder-lanes">
          <div className="create-builder-lane is-picked">
            <div className="create-builder-lane-head">
              <span className="create-builder-lane-title">{t('builder.platform.title')}</span>
              <span className="create-builder-lane-badge is-turq">{t('create.defaultBadge')}</span>
            </div>
            <p className="create-builder-lane-detail">{t('builder.platform.detail')}</p>
            <ul className="create-builder-lane-list">
              <li>{t('create.platformPoint1')}</li>
              <li>{t('create.platformPoint2')}</li>
            </ul>
          </div>
          <div className="create-builder-lane">
            <div className="create-builder-lane-head">
              <span className="create-builder-lane-title">{t('builder.self.title')}</span>
              <span className="create-builder-lane-badge">{t('create.freeBadge')}</span>
            </div>
            <p className="create-builder-lane-detail">{t('builder.self.detail')}</p>
            <ul className="create-builder-lane-list">
              <li>{t('create.selfPoint1')}</li>
              <li>{t('create.selfPoint2')}</li>
            </ul>
            <div className="create-agent-chips">
              <span className="create-agent-chip">{t('connect.clients.claudeCode')}</span>
              <span className="create-agent-chip">{t('connect.clients.codex')}</span>
              <span className="create-agent-chip">{t('connect.clients.cursor')}</span>
              <span className="create-agent-chip">{t('create.anyMcpClient')}</span>
            </div>
          </div>
        </div>
      </section>

      <CatalogRail
        heading={t('create.showcaseHeading')}
        entries={showcaseEntries}
        via="create_showcase"
        onPlayGame={onPlayGame}
      />
    </div>
  );
}
