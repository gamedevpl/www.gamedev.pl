import { useTranslation } from 'react-i18next';
import { BetaWelcomeSplash } from './BetaWelcomeSplash.js';
import { GameTheater } from './GameTheater.js';
import { PixelIcon } from './PixelIcon.js';
import { PartyStage } from './surfaces/party/PartyStage.js';
import type { StageContent } from './useGameTheater.js';

export type StageOverlayProps = {
  stageContent: StageContent | null;
  onExitCatalogTheater: () => void;
  onExitPartyTheater: () => void;
  showBetaWelcome: boolean;
  onDismissBetaWelcome: () => void;
};

// The full-viewport theater, rendered from every branch that can open it.
export function StageOverlay({
  stageContent,
  onExitCatalogTheater,
  onExitPartyTheater,
  showBetaWelcome,
  onDismissBetaWelcome,
}: StageOverlayProps) {
  const { t } = useTranslation();

  return (
    <>
      {stageContent?.type === 'party' && (
        <section id="stage" className="panel stage is-playing-full-viewport">
          <div className="game-theater-bar">
            <div className="game-theater-meta">
              <span className="theater-badge">
                <PixelIcon name="phone" size={13} /> {t('party.badge')}
              </span>
              <h2 className="theater-title">{stageContent.game.title}</h2>
            </div>
            <div className="game-theater-actions">
              <button
                className="secondary-btn exit-btn"
                onClick={onExitPartyTheater}
                aria-label={t('catalog.exitPlayer', { defaultValue: 'Close' })}
                title={t('catalog.exitPlayer', { defaultValue: 'Close' })}
              >
                <PixelIcon name="close" size={14} />
              </button>
            </div>
          </div>
          <div className="game-viewport-container">
            <PartyStage
              key={stageContent.session.code}
              game={stageContent.game}
              session={stageContent.session}
              via={stageContent.via}
              onExit={onExitPartyTheater}
            />
          </div>
        </section>
      )}

      {stageContent?.type === 'catalog' && (
        <GameTheater
          key={stageContent.game.slug}
          title={stageContent.game.title}
          // AI Act art. 50 disclosure, kept short beside the title.
          badge={{ icon: 'sparkle', label: t('ai.generatedShort') }}
          source={{ slug: stageContent.game.slug }}
          onExit={onExitCatalogTheater}
          orientation={stageContent.game.orientation}
          reportSlug={stageContent.game.slug}
          submittedBy={stageContent.game.submittedBy}
          creatorHandle={stageContent.game.creatorHandle}
          controls={stageContent.game.controls}
          touch={stageContent.game.touch}
          editor={stageContent.game.editor}
          via={stageContent.via}
          initialRemixOpen={stageContent.initialRemixOpen}
          initialRemixRequest={stageContent.initialRemixRequest}
        />
      )}

      {showBetaWelcome && <BetaWelcomeSplash onContinue={onDismissBetaWelcome} />}
    </>
  );
}
