import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CatalogRail } from './surfaces/catalog/CatalogRail.js';
import type { CatalogEntry } from './catalog.js';
import { HeroPromptSection } from './HeroPromptSection.js';
import { CreateStepsList } from './CreateStepsList.js';
import { CreateAgentCallout } from './CreateAgentCallout.js';
import { CreateBuilderLanes } from './CreateBuilderLanes.js';
import { PixelIcon } from './PixelIcon.js';
import type { PlatformBuilderAvailability } from './submissionApi.js';
import type { PlayVia } from './visitTelemetry.js';
import './create-page.css';

type CreatePageProps = {
  initialPrompt: string;
  retryKey: string;
  catalogEntries: CatalogEntry[];
  onPlayGame: (game: CatalogEntry, via?: PlayVia) => void;
  submissionStatus: 'idle' | 'refining' | 'loading';
  submissionError: string | null;
  onSubmitSpec: (concept: string, referenceImages?: string[]) => void;
  onPlatformBuilderAvailability: (availability: PlatformBuilderAvailability | undefined) => void;
  onNavigate?: (path: string) => void;
};

// Real catalog cards for the showcase, no new data — just a slice.
const SHOWCASE_LIMIT = 4;

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
  onNavigate,
}: CreatePageProps) {
  const { t } = useTranslation();

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
          enableCatalogMatch={false}
          submissionStatus={submissionStatus}
          submissionError={submissionError}
          onSubmitSpec={onSubmitSpec}
          onPlatformBuilderAvailability={onPlatformBuilderAvailability}
        />
      </div>

      <CreateAgentCallout onNavigate={onNavigate} />

      <section className="create-steps" aria-labelledby="create-steps-heading">
        <h2 id="create-steps-heading" className="create-section-heading">
          {t('create.stepsHeading')}
        </h2>
        <CreateStepsList />
        <p className="create-notify-note">
          <PixelIcon name="signal" size={13} /> {t('create.notifyNote')}
        </p>
      </section>

      <CreateBuilderLanes onNavigate={onNavigate} />

      <CatalogRail
        heading={t('create.showcaseHeading')}
        entries={showcaseEntries}
        via="create_showcase"
        onPlayGame={onPlayGame}
      />
    </div>
  );
}
